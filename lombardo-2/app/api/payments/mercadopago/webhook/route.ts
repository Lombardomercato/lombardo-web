import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { PaymentWebhookService } from "@/lib/server/payments/payment-webhook-service";
import { verifyMercadoPagoWebhookSignature } from "@/lib/server/payments/webhook-signature";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import {
  getRequestId,
  logCommerceError,
  logDevCommerce,
} from "@/lib/server/dev-commerce-logger";
import { readJsonBody } from "@/lib/server/request-body";
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
  const requestId = getRequestId(request);
  const rateLimit = checkRateLimit(`mp-webhook:${getRequestIp(request)}`, {
    limit: 180,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { accepted: false },
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
      return noStoreJson(
        { accepted: false },
        { status: 401, headers: { "X-Request-ID": requestId } },
      );
    }

    const payload = await readJsonBody(
      request,
      MAX_WEBHOOK_BODY_BYTES,
      "El webhook recibido es demasiado grande.",
    );
    if (!isRecord(payload)) {
      return noStoreJson(
        { accepted: false },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }
    if (payload.type !== "payment") {
      return noStoreJson(
        { accepted: true, ignored: true },
        { status: 202, headers: { "X-Request-ID": requestId } },
      );
    }
    const data = isRecord(payload.data) ? payload.data : {};
    const paymentId = queryDataId ?? String(data.id ?? "");
    const eventId = String(payload.id ?? "");
    if (!/^\d{1,40}$/.test(paymentId) || !/^[a-zA-Z0-9_-]{1,160}$/.test(eventId)) {
      return noStoreJson(
        { accepted: false },
        { status: 400, headers: { "X-Request-ID": requestId } },
      );
    }

    logDevCommerce("webhook.received", {
      paymentId,
      webhookEventId: eventId,
      requestId,
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
    return noStoreJson(
      { accepted: true, duplicate: result.duplicate },
      { headers: { "X-Request-ID": requestId } },
    );
  } catch (error) {
    logCommerceError("webhook.failed", error, {
      requestId,
      route: "/api/payments/mercadopago/webhook",
    });
    return serverErrorResponse(error, requestId);
  }
}
