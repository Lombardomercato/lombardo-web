import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { createOrderServices } from "@/lib/server/services";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const rateLimit = checkRateLimit(`order-status:${getRequestIp(request)}`, {
    limit: 60,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { code: "CREATE_FAILED", message: "Esperá un momento antes de reintentar." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const { publicId } = await params;
  if (!publicIdPattern.test(publicId)) {
    return noStoreJson(
      { code: "ORDER_NOT_FOUND", message: "No encontramos ese pedido." },
      { status: 404 },
    );
  }

  try {
    const { orders } = createOrderServices();
    const order = await orders.getByPublicId(publicId);
    if (!order) {
      return noStoreJson(
        { code: "ORDER_NOT_FOUND", message: "No encontramos ese pedido." },
        { status: 404 },
      );
    }
    return noStoreJson(orders.toPublicStatus(order));
  } catch (error) {
    return serverErrorResponse(error);
  }
}
