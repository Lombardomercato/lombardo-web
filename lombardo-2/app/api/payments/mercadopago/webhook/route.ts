import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { PaymentWebhookService } from "@/lib/server/payments/payment-webhook-service";
import { verifyMercadoPagoWebhookSignature } from "@/lib/server/payments/webhook-signature";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { logDevCommerce } from "@/lib/server/dev-commerce-logger";
import {
  createOrderServices,
  getWebhookSecret,
  requirePaymentGateway,
} from "@/lib/server/services";

const MAX_WEBHOOK_BODY_BYTES = 64_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_WEBHOOK_BODY_BYTES) {
    return noStoreJson({ accepted: false }, { status: 413 });
  }
  const rateLimit = checkRateLimit(`mp-webhook:${getRequestIp(request)}`, {
    limit: 180,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { accepted: false },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  try {
    const url = new URL(request.url);
    const queryDataId = url.searchParams.get("data.id") ?? url.searchParams.get("id");
    const signatureValid = verifyMercadoPagoWebhookSignature({
      xSignature: request.headers.get("x-signature"),
      xRequestId: request.headers.get("x-request-id"),
      dataId: queryDataId,
      secret: getWebhookSecret(),
      toleranceSeconds: Number(
        process.env.MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS ?? 300,
      ),
    });
    if (!signatureValid) {
      return noStoreJson({ accepted: false }, { status: 401 });
    }

    const payload = (await request.json()) as unknown;
    if (!isRecord(payload)) {
      return noStoreJson({ accepted: false }, { status: 400 });
    }
    if (payload.type !== "payment") {
      return noStoreJson({ accepted: true, ignored: true }, { status: 202 });
    }
    const data = isRecord(payload.data) ? payload.data : {};
    const paymentId = queryDataId ?? String(data.id ?? "");
    const eventId = String(payload.id ?? "");
    if (!/^\d{1,40}$/.test(paymentId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(eventId)) {
      return noStoreJson({ accepted: false }, { status: 400 });
    }

    logDevCommerce("webhook.received", {
      paymentId,
      webhookEventId: eventId,
    });

    const services = createOrderServices();
    const webhook = new PaymentWebhookService({
      tenantId: services.tenantId,
      orders: services.orders,
      store: services.store,
      paymentGateway: requirePaymentGateway(),
      testMode: true,
    });
    const result = await webhook.process({ eventId, paymentId, payload });
    return noStoreJson({ accepted: true, duplicate: result.duplicate });
  } catch (error) {
    return serverErrorResponse(error);
  }
}
