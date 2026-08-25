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

interface EmailOrderNotificationServiceOptions {
  store: OrderNotificationStore;
  configurationFactory: () => {
    provider: EmailOrderProvider;
    recipient: string;
    sender: string;
    adminUrl: string;
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

function customerName(order: OrderDraft) {
  return `${order.customer.firstName} ${order.customer.lastName}`.trim();
}

function deliveryLabel(order: OrderDraft) {
  return order.deliveryMethod === "PICKUP" ? "Retiro en Lombardo" : "Envío";
}

function paymentLabel(order: OrderDraft) {
  const labels: Record<OrderDraft["paymentStatus"], string> = {
    pending: "Pendiente",
    approved: "Aprobado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
    refunded: "Reintegrado",
  };
  return labels[order.paymentStatus];
}

export function buildNewOrderEmail(order: OrderDraft, adminUrl: string) {
  const displayId = order.publicId.slice(0, 8).toUpperCase();
  const name = customerName(order);
  const total = formatCurrency(order.total);
  const delivery = deliveryLabel(order);
  const payment = paymentLabel(order);
  const orderUrl = `${adminUrl.replace(/\/$/, "")}/pedidos/${order.publicId}`;
  const subject = `Nuevo pedido #${displayId} · ${total}`;
  const text = [
    `Pedido #${displayId}`,
    `Cliente: ${name}`,
    `Total: ${total}`,
    `Entrega: ${delivery}`,
    `Pago: ${payment}`,
    `Abrir pedido: ${orderUrl}`,
  ].join("\n");
  const rows = [
    ["Pedido", `#${displayId}`],
    ["Cliente", name],
    ["Total", total],
    ["Entrega", delivery],
    ["Pago", payment],
  ];
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#073f73"><h1>Nuevo pedido Lombardo</h1>${rows.map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("")}<p><a href="${escapeHtml(orderUrl)}">Abrir pedido en Admin</a></p></body></html>`;
  return {
    subject,
    text,
    html,
    idempotencyKey: `lombardo-new-order-${order.id}`,
  };
}

export class EmailOrderNotificationService implements NewOrderNotifier {
  private readonly store: OrderNotificationStore;
  private readonly configurationFactory: EmailOrderNotificationServiceOptions["configurationFactory"];

  constructor(options: EmailOrderNotificationServiceOptions) {
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
      const email = buildNewOrderEmail(order, configuration.adminUrl);
      providerStarted = true;
      const result = await configuration.provider.send({
        from: configuration.sender,
        recipient: configuration.recipient,
        ...email,
      });
      await this.store.markSent(order.tenantId, claim.notification.id, result.messageId);
      logDevCommerce("order_notification.sent", {
        orderId: order.id,
        publicId: order.publicId,
        notificationId: claim.notification.id,
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
        providerError?.message ?? "No se pudo completar la notificación operativa.";
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
        notificationStatus: status,
        errorCode,
      });
    }
    return claim;
  }
}
