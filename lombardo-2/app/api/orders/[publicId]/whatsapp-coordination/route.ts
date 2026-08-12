import { noStoreJson, serverErrorResponse } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";
import { ServerOrderError } from "@/lib/server/orders/server-order-error";
import { createOrderServices } from "@/lib/server/services";
import { buildWhatsAppCoordinationUrl } from "@/lib/checkout/whatsapp-coordination";
import {
  getRequestId,
  logCommerceError,
  logDevCommerce,
} from "@/lib/server/dev-commerce-logger";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ publicId: string }> },
) {
  const requestId = getRequestId(request);
  if (request.headers.get("sec-fetch-site") === "cross-site") {
    return noStoreJson(
      { code: "INVALID_REQUEST", message: "No pudimos validar la solicitud." },
      { status: 403, headers: { "X-Request-ID": requestId } },
    );
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStoreJson(
      { code: "INVALID_REQUEST", message: "No pudimos validar la solicitud." },
      { status: 403, headers: { "X-Request-ID": requestId } },
    );
  }

  const rateLimit = checkRateLimit(`whatsapp-order:${getRequestIp(request)}`, {
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
      throw new ServerOrderError("ORDER_NOT_FOUND", "No encontramos ese pedido.", {
        status: 404,
      });
    }
    if (order.orderStatus !== "pending_payment" || order.paymentStatus !== "pending") {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        "El pedido ya no admite cambios en la modalidad de pago.",
        { status: 409 },
      );
    }

    const whatsappUrl = buildWhatsAppCoordinationUrl(
      order,
      process.env.NEXT_PUBLIC_WHATSAPP_URL,
    );
    if (!whatsappUrl) {
      throw new ServerOrderError(
        "SERVER_NOT_CONFIGURED",
        "El canal de WhatsApp todavía no está configurado.",
        { status: 503 },
      );
    }

    const updatedOrder = await orders.savePaymentMethod(
      order.id,
      "whatsapp_coordination",
    );
    logDevCommerce("payment.whatsapp_coordination_selected", {
      requestId,
      orderId: updatedOrder.id,
      publicId: updatedOrder.publicId,
      reason: "customer_selected",
    });
    return noStoreJson(
      { order: updatedOrder, whatsappUrl },
      { headers: { "X-Request-ID": requestId } },
    );
  } catch (error) {
    logCommerceError("whatsapp.coordination_failed", error, {
      requestId,
      route: "/api/orders/[publicId]/whatsapp-coordination",
    });
    return serverErrorResponse(error, requestId);
  }
}
