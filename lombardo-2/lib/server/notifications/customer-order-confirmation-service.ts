import "server-only";

import type { OrderDraft } from "../../../types/checkout.ts";
import { formatCurrency } from "../../utils/format-currency.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import { OrderNotificationProviderError } from "./provider-error.ts";
import type {
  ClaimedOrderNotification,
  EmailOrderProvider,
  NewOrderNotifier,
  OrderNotificationStore,
} from "./types.ts";

interface CustomerOrderConfirmationServiceOptions {
  store: OrderNotificationStore;
  configurationFactory: () => {
    provider: EmailOrderProvider;
    sender: string;
    appUrl: string;
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function paymentMessage(order: OrderDraft) {
  if (order.paymentStatus === "approved") return "Pago aprobado.";
  if (order.paymentMethod === "whatsapp_coordination") {
    return "El pago todavía debe coordinarse con Lombardo.";
  }
  return "El pago está pendiente de confirmación.";
}

function deliveryLabel(order: OrderDraft) {
  return order.deliveryMethod === "PICKUP"
    ? "Retiro en Lombardo"
    : "Envío a domicilio";
}

export function buildCustomerOrderConfirmationEmail(
  order: OrderDraft,
  appUrl: string,
) {
  const displayId = order.publicId.slice(0, 8).toUpperCase();
  const orderUrl = `${appUrl.replace(/\/$/, "")}/pedido/${order.publicId}`;
  const total = formatCurrency(order.total);
  const payment = paymentMessage(order);
  const delivery = deliveryLabel(order);
  const items = order.items.map(
    (item) => `${item.quantity} × ${item.name} — ${formatCurrency(item.lineTotal)}`,
  );
  const subject = `Recibimos tu pedido #${displayId}`;
  const text = [
    `Hola ${order.customer.firstName},`,
    "Recibimos tu pedido en Lombardo.",
    `Pedido: #${displayId}`,
    ...items,
    `Total: ${total}`,
    `Entrega: ${delivery}`,
    `Estado del pago: ${payment}`,
    `Ver pedido: ${orderUrl}`,
  ].join("\n");
  const itemRows = order.items
    .map(
      (item) =>
        `<li>${escapeHtml(String(item.quantity))} × ${escapeHtml(item.name)} — ${escapeHtml(formatCurrency(item.lineTotal))}</li>`,
    )
    .join("");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#073f73"><h1>Recibimos tu pedido.</h1><p>Hola ${escapeHtml(order.customer.firstName)},</p><p>Tu pedido <strong>#${displayId}</strong> fue recibido correctamente.</p><ul>${itemRows}</ul><p><strong>Total:</strong> ${escapeHtml(total)}</p><p><strong>Entrega:</strong> ${escapeHtml(delivery)}</p><p><strong>Estado del pago:</strong> ${escapeHtml(payment)}</p><p><a href="${escapeHtml(orderUrl)}">Ver estado del pedido</a></p><p>Gracias por elegir Lombardo.</p></body></html>`;

  return {
    subject,
    text,
    html,
    idempotencyKey: `lombardo-customer-order-confirmation-${order.id}`,
  };
}

export class CustomerOrderConfirmationService implements NewOrderNotifier {
  private readonly store: OrderNotificationStore;
  private readonly configurationFactory: CustomerOrderConfirmationServiceOptions["configurationFactory"];

  constructor(options: CustomerOrderConfirmationServiceOptions) {
    this.store = options.store;
    this.configurationFactory = options.configurationFactory;
  }

  notify(order: OrderDraft) {
    return this.deliver(order, false);
  }

  retry(order: OrderDraft) {
    return this.deliver(order, true);
  }

  private async deliver(
    order: OrderDraft,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification> {
    const claim = await this.store.claim(order.tenantId, order.id, allowRetry);
    if (!claim.claimed) return claim;

    let providerStarted = false;
    try {
      const configuration = this.configurationFactory();
      const email = buildCustomerOrderConfirmationEmail(
        order,
        configuration.appUrl,
      );
      providerStarted = true;
      const result = await configuration.provider.send({
        from: configuration.sender,
        recipient: order.customer.email,
        ...email,
      });
      await this.store.markSent(
        order.tenantId,
        claim.notification.id,
        result.messageId,
      );
      logDevCommerce("order_notification.sent", {
        orderId: order.id,
        publicId: order.publicId,
        notificationId: claim.notification.id,
        notificationKind: "customer_order_confirmation",
        providerMessageId: result.messageId,
      });
    } catch (error) {
      const providerError =
        error instanceof OrderNotificationProviderError ? error : null;
      const status =
        providerError?.outcome === "rejected" || !providerStarted
          ? "failed"
          : "unknown";
      const errorCode =
        providerError?.code ??
        (providerStarted ? "NOTIFICATION_FAILED" : "CONFIGURATION_FAILED");
      const errorSummary =
        providerError?.message ??
        "No se pudo completar la confirmación por email al cliente.";
      await this.store.markFailed(
        order.tenantId,
        claim.notification.id,
        status,
        errorCode,
        errorSummary,
      );
      logDevCommerce("order_notification.failed", {
        orderId: order.id,
        publicId: order.publicId,
        notificationId: claim.notification.id,
        notificationKind: "customer_order_confirmation",
        notificationStatus: status,
        errorCode,
      });
    }
    return claim;
  }
}
