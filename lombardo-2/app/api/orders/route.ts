import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import {
  getRequestId,
  logCommerceError,
} from "@/lib/server/dev-commerce-logger";
import { parseCreateOrderInput } from "@/lib/server/orders/order-input";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { readJsonBody } from "@/lib/server/request-body";
import { createCheckoutCoordinator } from "@/lib/server/services";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";

const MAX_ORDER_BODY_BYTES = 32_000;

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    fetchSite === "cross-site"
  ) {
    return noStoreJson(
      { code: "INVALID_REQUEST", message: "No pudimos validar la solicitud." },
      { status: 403, headers: { "X-Request-ID": requestId } },
    );
  }

  const rateLimit = checkRateLimit(`create-order:${getRequestIp(request)}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { code: "CREATE_FAILED", message: "Esperá un momento antes de reintentar." },
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
    const input = parseCreateOrderInput(
      await readJsonBody(
        request,
        MAX_ORDER_BODY_BYTES,
        "El pedido recibido es demasiado grande.",
      ),
    );
    const pricingContext = await getCurrentCustomerPricingContext();
    const { coordinator } = createCheckoutCoordinator(pricingContext);
    const result = await coordinator.createOrder(input);
    return noStoreJson(result, {
      status: result.reused ? 200 : 201,
      headers: { "X-Request-ID": requestId },
    });
  } catch (error) {
    logCommerceError("order.request_failed", error, {
      requestId,
      route: "/api/orders",
    });
    return serverErrorResponse(error, requestId);
  }
}
