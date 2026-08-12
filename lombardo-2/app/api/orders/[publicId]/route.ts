import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { getRequestId, logCommerceError } from "@/lib/server/dev-commerce-logger";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { createOrderServices } from "@/lib/server/services";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = getRequestId(request);
  const rateLimit = checkRateLimit(`order-status:${getRequestIp(request)}`, {
    limit: 60,
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

  const { publicId } = await params;
  if (!publicIdPattern.test(publicId)) {
    return noStoreJson(
      { code: "ORDER_NOT_FOUND", message: "No encontramos ese pedido." },
      { status: 404, headers: { "X-Request-ID": requestId } },
    );
  }

  try {
    const { orders } = createOrderServices();
    const order = await orders.getByPublicId(publicId);
    if (!order) {
      return noStoreJson(
        { code: "ORDER_NOT_FOUND", message: "No encontramos ese pedido." },
        { status: 404, headers: { "X-Request-ID": requestId } },
      );
    }
    return noStoreJson(orders.toPublicStatus(order), {
      headers: { "X-Request-ID": requestId },
    });
  } catch (error) {
    logCommerceError("order.request_failed", error, {
      requestId,
      route: "/api/orders/[publicId]",
    });
    return serverErrorResponse(error, requestId);
  }
}
