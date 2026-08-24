import "server-only";

import type { OrderDraft } from "../../../types/checkout.ts";
import { formatCurrency } from "../../utils/format-currency.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import type {
  ClaimedOrderNotification,
  NewOrderNotifier,
  OrderNotificationStore,
  WhatsAppOrderProvider,
} from "./types.ts";
import { WhatsAppProviderError } from "./whatsapp-cloud-api.ts";

interface OrderNotificationServiceOptions {
  store: OrderNotificationStore;
  configurationFactory: () => {
    provider: WhatsAppOrderProvider;
    recipient: string;
    templateName: string;
    languageCode: string;
    adminUrl: string;
  };
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

export function buildNewOrderTemplateParameters(
  order: OrderDraft,
  adminUrl: string,
) {
  return [
    order.publicId.slice(0, 8).toUpperCase(),
    customerName(order),
    formatCurrency(order.total),
    deliveryLabel(order),
    paymentLabel(order),
    `${adminUrl.replace(/\/$/, "")}/pedidos/${order.publicId}`,
  ] as const;
}

export class OrderNotificationService implements NewOrderNotifier {
  private readonly store: OrderNotificationStore;
  private readonly configurationFactory: OrderNotificationServiceOptions["configurationFactory"];

  constructor(options: OrderNotificationServiceOptions) {
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
      providerStarted = true;
      const result = await configuration.provider.send({
        recipient: configuration.recipient,
        templateName: configuration.templateName,
        languageCode: configuration.languageCode,
        parameters: buildNewOrderTemplateParameters(order, configuration.adminUrl),
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
        providerMessageId: result.messageId,
      });
    } catch (error) {
      const providerError =
        error instanceof WhatsAppProviderError ? error : null;
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
