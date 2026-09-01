import "server-only";

import type { FulfillmentStatus } from "../admin/types.ts";
import type {
  CheckoutCustomer,
  DeliveryMethod,
  OrderCurrency,
  PaymentMethod,
  PaymentStatus,
} from "../../../types/checkout.ts";
import { formatCurrency } from "../../utils/format-currency.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import { OrderNotificationProviderError } from "./provider-error.ts";
import type {
  EmailOrderProvider,
  OrderNotificationChannel,
  OrderNotificationKind,
  OrderNotificationStatus,
  OrderNotificationStore,
  WhatsAppOrderProvider,
} from "./types.ts";

export interface CustomerOrderUpdateOrder {
  id: string;
  tenantId: string;
  publicId: string;
  customer: CheckoutCustomer;
  fulfillmentStatus: FulfillmentStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  deliveryCost: number;
  total: number;
  currency: OrderCurrency;
}

export interface CustomerOrderUpdateInput {
  order: CustomerOrderUpdateOrder;
  kind: Extract<
    OrderNotificationKind,
    | "customer_fulfillment_status"
    | "customer_payment_status"
    | "customer_delivery_update"
  >;
  eventKey: string;
}

export interface CustomerOrderUpdateResult {
  channel: OrderNotificationChannel;
  status: OrderNotificationStatus;
}

export interface CustomerOrderUpdateNotifier {
  notify(input: CustomerOrderUpdateInput): Promise<CustomerOrderUpdateResult>;
}

const FULFILLMENT_COPY: Record<FulfillmentStatus, { title: string; detail: string }> = {
  new: {
    title: "Tu pedido volvió a revisión",
    detail: "Estamos revisando los datos del pedido y te avisaremos cuando quede confirmado.",
  },
  confirmed: {
    title: "Tu pedido está confirmado",
    detail: "Ya confirmamos el pedido y pronto comenzaremos a prepararlo.",
  },
  preparing: {
    title: "Estamos preparando tu pedido",
    detail: "La selección Lombardo ya está en preparación.",
  },
  ready: {
    title: "Tu pedido está listo",
    detail: "El pedido está listo para retirar o para continuar con la entrega coordinada.",
  },
  delivered: {
    title: "Tu pedido fue entregado",
    detail: "Marcamos el pedido como entregado. Gracias por elegir Lombardo.",
  },
  cancelled: {
    title: "Tu pedido fue cancelado",
    detail: "El pedido quedó cancelado. Si necesitás ayuda, respondé este mensaje.",
  },
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "pendiente",
  approved: "aprobado",
  rejected: "rechazado",
  cancelled: "cancelado",
  refunded: "devuelto",
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mercado_pago: "Mercado Pago",
  whatsapp_coordination: "coordinación por WhatsApp",
  bank_transfer: "transferencia bancaria",
  cash: "efectivo",
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function updateCopy(input: CustomerOrderUpdateInput) {
  if (input.kind === "customer_fulfillment_status") {
    return FULFILLMENT_COPY[input.order.fulfillmentStatus];
  }
  if (input.kind === "customer_payment_status") {
    return {
      title: `Pago ${PAYMENT_STATUS_LABELS[input.order.paymentStatus]}`,
      detail: `La forma de pago registrada es ${PAYMENT_METHOD_LABELS[input.order.paymentMethod]}.`,
    };
  }
  return {
    title: "Actualizamos el costo de envío",
    detail: `El envío quedó en ${formatCurrency(input.order.deliveryCost)} y el total del pedido es ${formatCurrency(input.order.total)}.`,
  };
}

function orderUrl(appUrl: string, publicId: string) {
  return `${appUrl.replace(/\/$/, "")}/pedido/${publicId}`;
}

export function buildCustomerOrderUpdateEmail(
  input: CustomerOrderUpdateInput,
  appUrl: string,
) {
  const displayId = input.order.publicId.slice(0, 8).toUpperCase();
  const copy = updateCopy(input);
  const url = orderUrl(appUrl, input.order.publicId);
  const subject = `Pedido #${displayId} · ${copy.title}`;
  const text = [
    `Hola ${input.order.customer.firstName},`,
    copy.title,
    copy.detail,
    `Pedido: #${displayId}`,
    `Total: ${formatCurrency(input.order.total)}`,
    `Ver pedido: ${url}`,
  ].join("\n");
  const html = `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#073f73"><p>Hola ${escapeHtml(input.order.customer.firstName)},</p><h1>${escapeHtml(copy.title)}.</h1><p>${escapeHtml(copy.detail)}</p><p><strong>Pedido:</strong> #${displayId}</p><p><strong>Total:</strong> ${escapeHtml(formatCurrency(input.order.total))}</p><p><a href="${escapeHtml(url)}">Ver estado del pedido</a></p><p>Lombardo Mercato</p></body></html>`;
  return {
    subject,
    text,
    html,
    idempotencyKey: `lombardo-${input.kind}-${input.order.id}-${input.eventKey}`,
  };
}

export function buildCustomerOrderUpdateWhatsAppParameters(
  input: CustomerOrderUpdateInput,
  appUrl: string,
) {
  const copy = updateCopy(input);
  return [
    input.order.customer.firstName,
    input.order.publicId.slice(0, 8).toUpperCase(),
    copy.title,
    copy.detail,
    formatCurrency(input.order.total),
    orderUrl(appUrl, input.order.publicId),
  ] as const;
}

function customerWhatsApp(value: string) {
  let phone = value.replace(/\D/g, "");
  if (phone.startsWith("0")) phone = phone.slice(1);
  if (!phone.startsWith("54")) phone = `54${phone}`;
  return phone;
}

abstract class CustomerOrderUpdateService {
  protected readonly store: OrderNotificationStore;
  abstract readonly channel: OrderNotificationChannel;

  constructor(store: OrderNotificationStore) {
    this.store = store;
  }

  protected async claim(input: CustomerOrderUpdateInput) {
    return this.store.claim(
      input.order.tenantId,
      input.order.id,
      false,
      input.eventKey,
    );
  }

  protected async sent(
    input: CustomerOrderUpdateInput,
    notificationId: string,
    providerMessageId: string,
  ): Promise<CustomerOrderUpdateResult> {
    await this.store.markSent(
      input.order.tenantId,
      notificationId,
      providerMessageId,
    );
    logDevCommerce("order_notification.sent", {
      orderId: input.order.id,
      publicId: input.order.publicId,
      notificationId,
      notificationKind: input.kind,
      providerMessageId,
    });
    return { channel: this.channel, status: "sent" };
  }

  protected async failed(
    input: CustomerOrderUpdateInput,
    notificationId: string,
    error: unknown,
    providerStarted: boolean,
  ): Promise<CustomerOrderUpdateResult> {
    const providerError = error instanceof OrderNotificationProviderError ? error : null;
    const status = providerError?.outcome === "rejected" || !providerStarted
      ? "failed"
      : "unknown";
    const errorCode = providerError?.code
      ?? (providerStarted ? "NOTIFICATION_FAILED" : "CONFIGURATION_FAILED");
    const errorSummary = providerError?.message
      ?? "No se pudo completar la notificación de estado al cliente.";
    await this.store.markFailed(
      input.order.tenantId,
      notificationId,
      status,
      errorCode,
      errorSummary,
    );
    logDevCommerce("order_notification.failed", {
      orderId: input.order.id,
      publicId: input.order.publicId,
      notificationId,
      notificationKind: input.kind,
      notificationStatus: status,
      errorCode,
    });
    return { channel: this.channel, status };
  }
}

export class CustomerOrderUpdateEmailService
  extends CustomerOrderUpdateService
  implements CustomerOrderUpdateNotifier {
  readonly channel = "email_resend" as const;
  private readonly configurationFactory: () => {
    provider: EmailOrderProvider;
    sender: string;
    appUrl: string;
  };

  constructor(options: {
    store: OrderNotificationStore;
    configurationFactory: CustomerOrderUpdateEmailService["configurationFactory"];
  }) {
    super(options.store);
    this.configurationFactory = options.configurationFactory;
  }

  async notify(input: CustomerOrderUpdateInput) {
    const claim = await this.claim(input);
    if (!claim.claimed) {
      return { channel: this.channel, status: claim.notification.status };
    }
    let providerStarted = false;
    try {
      const configuration = this.configurationFactory();
      providerStarted = true;
      const result = await configuration.provider.send({
        from: configuration.sender,
        recipient: input.order.customer.email,
        ...buildCustomerOrderUpdateEmail(input, configuration.appUrl),
      });
      return this.sent(input, claim.notification.id, result.messageId);
    } catch (error) {
      return this.failed(input, claim.notification.id, error, providerStarted);
    }
  }
}

export class CustomerOrderUpdateWhatsAppService
  extends CustomerOrderUpdateService
  implements CustomerOrderUpdateNotifier {
  readonly channel = "whatsapp_cloud_api" as const;
  private readonly configurationFactory: () => {
    provider: WhatsAppOrderProvider;
    templateName: string;
    languageCode: string;
    appUrl: string;
  };

  constructor(options: {
    store: OrderNotificationStore;
    configurationFactory: CustomerOrderUpdateWhatsAppService["configurationFactory"];
  }) {
    super(options.store);
    this.configurationFactory = options.configurationFactory;
  }

  async notify(input: CustomerOrderUpdateInput) {
    const claim = await this.claim(input);
    if (!claim.claimed) {
      return { channel: this.channel, status: claim.notification.status };
    }
    let providerStarted = false;
    try {
      const configuration = this.configurationFactory();
      providerStarted = true;
      const result = await configuration.provider.send({
        recipient: customerWhatsApp(input.order.customer.whatsapp),
        templateName: configuration.templateName,
        languageCode: configuration.languageCode,
        parameters: buildCustomerOrderUpdateWhatsAppParameters(
          input,
          configuration.appUrl,
        ),
      });
      return this.sent(input, claim.notification.id, result.messageId);
    } catch (error) {
      return this.failed(input, claim.notification.id, error, providerStarted);
    }
  }
}
