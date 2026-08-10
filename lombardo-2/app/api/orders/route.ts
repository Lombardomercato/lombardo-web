import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { parseCreateOrderInput } from "@/lib/server/orders/order-input";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { createCheckoutCoordinator } from "@/lib/server/services";

const MAX_ORDER_BODY_BYTES = 32_000;

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_ORDER_BODY_BYTES) {
    return noStoreJson(
      { code: "INVALID_REQUEST", message: "El pedido recibido es demasiado grande." },
      { status: 413 },
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
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  try {
    const input = parseCreateOrderInput(await request.json());
    const { coordinator } = createCheckoutCoordinator();
    const result = await coordinator.createOrder(input);
    return noStoreJson(result, { status: result.reused ? 200 : 201 });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
