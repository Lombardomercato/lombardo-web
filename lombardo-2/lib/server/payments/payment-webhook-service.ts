import type { OrderDraft } from "../../../types/checkout.ts";
import type {
  RuniaOrderStore,
  ServerOrderRepository,
} from "../orders/order-dependencies.ts";
import { ServerOrderError } from "../orders/server-order-error.ts";
import type { PaymentGateway } from "./payment-gateway.ts";
import { getPaymentTransition } from "./payment-status-policy.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";

interface PaymentWebhookServiceOptions {
  tenantId: string;
  orders: ServerOrderRepository;
  store: RuniaOrderStore;
  paymentGateway: PaymentGateway;
  expectedLiveMode?: boolean;
}

export interface ProcessPaymentWebhookInput {
  eventId: string;
  paymentId: string;
  payload: Record<string, unknown>;
}

export interface ProcessPaymentWebhookResult {
  duplicate: boolean;
  order: OrderDraft;
}

export class PaymentWebhookService {
  private readonly tenantId: string;
  private readonly orders: ServerOrderRepository;
  private readonly store: RuniaOrderStore;
  private readonly paymentGateway: PaymentGateway;
  private readonly expectedLiveMode: boolean;

  constructor(options: PaymentWebhookServiceOptions) {
    this.tenantId = options.tenantId;
    this.orders = options.orders;
    this.store = options.store;
    this.paymentGateway = options.paymentGateway;
    this.expectedLiveMode = options.expectedLiveMode ?? false;
  }

  async process(
    input: ProcessPaymentWebhookInput,
  ): Promise<ProcessPaymentWebhookResult> {
    const payment = await this.paymentGateway.getPayment(input.paymentId);
    if (payment.liveMode !== this.expectedLiveMode) {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        this.expectedLiveMode
          ? "Se rechazó un pago TEST en el entorno LIVE."
          : "Se rechazó un pago productivo en el entorno TEST.",
        { status: 403 },
      );
    }
    if (!payment.externalReference || !/^\d{1,30}$/.test(payment.externalReference)) {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        "El pago no contiene una referencia de orden válida.",
        { status: 422 },
      );
    }

    const order = await this.orders.getById(payment.externalReference);
    if (!order) {
      throw new ServerOrderError(
        "ORDER_NOT_FOUND",
        "El pago no corresponde a una orden de Lombardo.",
        { status: 404 },
      );
    }
    const metadataOrderId = payment.metadata?.order_id;
    if (metadataOrderId !== undefined && String(metadataOrderId) !== order.id) {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        "La referencia interna del pago no coincide con la orden.",
        { status: 422 },
      );
    }
    if (
      payment.currencyId !== order.currency ||
      Math.abs(payment.transactionAmount - order.total) > 0.001
    ) {
      throw new ServerOrderError(
        "INVALID_REQUEST",
        "El monto o la moneda del pago no coincide con la orden.",
        { status: 422 },
      );
    }

    const transition = getPaymentTransition(
      order.paymentStatus,
      order.orderStatus,
      payment.status,
    );
    const applied = await this.store.applyPaymentEventAtomic(
      {
        tenantId: this.tenantId,
        orderId: order.id,
        eventId: input.eventId,
        providerPaymentId: payment.id,
        providerStatus: payment.status,
        payload: input.payload,
      },
      {
        ...transition,
        paymentProviderId: payment.id,
      },
    );
    if (applied.duplicate) {
      logDevCommerce("webhook.duplicate", {
        orderId: order.id,
        publicId: order.publicId,
        paymentId: payment.id,
        webhookEventId: input.eventId,
        duplicate: true,
      });
    } else {
      logDevCommerce("payment.transition", {
        orderId: order.id,
        publicId: order.publicId,
        paymentId: payment.id,
        webhookEventId: input.eventId,
        fromPaymentStatus: order.paymentStatus,
        toPaymentStatus: applied.order.paymentStatus,
        fromOrderStatus: order.orderStatus,
        toOrderStatus: applied.order.orderStatus,
      });
    }
    return applied;
  }
}
