import { quickOrderProvider } from "@/lib/commerce";
import { noStoreJson } from "@/lib/server/http-response";
import {
  getCurrentCustomerAccessState,
  pricingContextForCustomerState,
} from "@/lib/server/customers/customer-auth";
import {
  isQuickOrderPricingContext,
  QUICK_ORDER_SEARCH_LIMIT,
  resolveQuickOrderAccess,
} from "@/lib/quick-order/types";
import { getRequestId, logCommerceError } from "@/lib/server/dev-commerce-logger";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const rateLimit = checkRateLimit(
    `quick-order-search:${getRequestIp(request)}`,
    { limit: 90, windowMs: 60_000 },
  );
  if (!rateLimit.allowed) {
    return noStoreJson(
      { error: "Esperá un momento antes de volver a buscar." },
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

    const search = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (!search || search.length > 80) {
      return noStoreJson(
        { products: [], queryTimeMs: 0, truncated: false },
        { headers: { "X-Request-ID": requestId } },
      );
    }

    const result = await quickOrderProvider.searchProducts(
      { search, limit: QUICK_ORDER_SEARCH_LIMIT },
      pricingContext,
    );
    return noStoreJson(result, {
      headers: {
        "Server-Timing": `quick-order;dur=${result.queryTimeMs}`,
        "X-Request-ID": requestId,
      },
    });
  } catch (error) {
    logCommerceError("quick_order.search_failed", error, {
      requestId,
      route: "/api/quick-order/search",
    });
    return noStoreJson(
      { error: "No pudimos buscar en el catálogo." },
      { status: 503, headers: { "X-Request-ID": requestId } },
    );
  }
}
