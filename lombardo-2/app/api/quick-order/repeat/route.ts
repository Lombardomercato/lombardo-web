import type { OrderItemSnapshot } from "@/types/checkout";

import { commerceProvider } from "@/lib/commerce";
import { revalidateRepeatOrderItems } from "@/lib/quick-order/repeat-order";
import {
  isQuickOrderPricingContext,
  resolveQuickOrderAccess,
} from "@/lib/quick-order/types";
import {
  getCurrentCustomerAccessState,
  pricingContextForCustomerState,
} from "@/lib/server/customers/customer-auth";
import { getRequestId, logCommerceError } from "@/lib/server/dev-commerce-logger";
import { noStoreJson } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { readJsonBody } from "@/lib/server/request-body";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PUBLIC_ORDER_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    fetchSite === "cross-site"
  ) {
    return noStoreJson(
      { error: "No pudimos validar la solicitud." },
      { status: 403, headers: { "X-Request-ID": requestId } },
    );
  }

  const rateLimit = checkRateLimit(`quick-order-repeat:${getRequestIp(request)}`, {
    limit: 12,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "Esperá un momento antes de volver a cargar el pedido." },
      {
        status: 429,
        headers: {
          "Retry-After": String(rateLimit.retryAfterSeconds),
          "X-Request-ID": requestId,
        },
      },
    );
  }

  try {
    const body = (await readJsonBody(request, 4_000, "Solicitud inválida.")) as {
      orderPublicId?: unknown;
    };
    const orderPublicId =
      typeof body.orderPublicId === "string" ? body.orderPublicId.trim() : "";
    if (!PUBLIC_ORDER_ID.test(orderPublicId)) {
      return noStoreJson(
        { error: "El pedido elegido no es válido." },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

    const state = await getCurrentCustomerAccessState();
    const access = resolveQuickOrderAccess(state.authUserId, state.account);
    if (!access.allowed) {
      return noStoreJson(
        { error: "Pedido Rápido requiere una cuenta B2B activa." },
        {
          status: access.reason === "SIGNED_OUT" ? 401 : 403,
          headers: { "X-Request-ID": requestId },
        },
      );
    }

    const pricingContext = pricingContextForCustomerState(state);
    if (!isQuickOrderPricingContext(pricingContext)) {
      return noStoreJson(
        { error: "La política de la cuenta no habilita Pedido Rápido." },
        { status: 403, headers: { "X-Request-ID": requestId } },
      );
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .from("commerce_orders")
      .select("items")
      .eq("tenant_record_id", access.account.tenantId)
      .eq("customer_account_id", access.account.id)
      .eq("public_id", orderPublicId)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return noStoreJson(
        { error: "No encontramos ese pedido en tu cuenta." },
        { status: 404, headers: { "X-Request-ID": requestId } },
      );
    }

    const historicalItems = Array.isArray(data.items)
      ? (data.items as OrderItemSnapshot[])
      : [];
    const productIds = historicalItems
      .slice(0, 50)
      .map((item) => item.productId);
    const currentProducts = await commerceProvider.getProductsByIds(
      productIds,
      pricingContext,
    );
    const result = revalidateRepeatOrderItems(
      historicalItems,
      currentProducts,
    );
    return noStoreJson(result, {
      headers: { "X-Request-ID": requestId },
    });
  } catch (error) {
    logCommerceError("quick_order.repeat_failed", error, {
      requestId,
      route: "/api/quick-order/repeat",
    });
    return noStoreJson(
      { error: "No pudimos revalidar ese pedido en Runia." },
      { status: 503, headers: { "X-Request-ID": requestId } },
    );
  }
}
