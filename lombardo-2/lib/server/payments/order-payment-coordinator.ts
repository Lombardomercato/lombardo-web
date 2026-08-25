import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderDraft,
  PaymentPreferenceResult,
} from "../../../types/checkout.ts";
import type { ServerOrderRepository } from "../orders/order-dependencies.ts";
import type { NewOrderNotifier } from "../notifications/types.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import type { PaymentGateway } from "./payment-gateway.ts";

interface OrderPaymentCoordinatorOptions {
  orders: ServerOrderRepository;
  paymentGateway: PaymentGateway | null;
  newOrderNotifier?: NewOrderNotifier | null;
  newOrderNotifiers?: readonly NewOrderNotifier[];
}

export class OrderPaymentCoordinator {
  private readonly orders: ServerOrderRepository;
  private readonly paymentGateway: PaymentGateway | null;
  private readonly newOrderNotifiers: readonly NewOrderNotifier[];

  constructor(options: OrderPaymentCoordinatorOptions) {
    this.orders = options.orders;
    this.paymentGateway = options.paymentGateway;
    this.newOrderNotifiers = [
      ...(options.newOrderNotifier ? [options.newOrderNotifier] : []),
      ...(options.newOrderNotifiers ?? []),
    ];
  }

  private existingPayment(order: OrderDraft): PaymentPreferenceResult | null {
    if (!order.paymentPreferenceId || !order.paymentCheckoutUrl) return null;
    return {
      preferenceId: order.paymentPreferenceId,
      checkoutUrl: order.paymentCheckoutUrl,
    };
  }

  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const result = await this.orders.createOrder(input);
    logDevCommerce(result.reused ? "order.reused" : "order.created", {
      orderId: result.order.id,
      publicId: result.order.publicId,
      reused: result.reused,
    });
    if (!result.reused && this.newOrderNotifiers.length) {
      const notificationResults = await Promise.allSettled(
        this.newOrderNotifiers.map((notifier) => notifier.notify(result.order)),
      );
      notificationResults.forEach((notificationResult, index) => {
        if (notificationResult.status === "rejected") {
          logDevCommerce("order_notification.persistence_failed", {
            orderId: result.order.id,
            publicId: result.order.publicId,
            reason: `notifier_${index}_persistence_failed`,
          });
        }
      });
    }
    if (result.order.paymentMethod === "whatsapp_coordination") {
      return { ...result, payment: null };
    }
    const existingPayment = this.existingPayment(result.order);
    if (existingPayment) {
      logDevCommerce("payment.preference_reused", {
        orderId: result.order.id,
        publicId: result.order.publicId,
        preferenceId: existingPayment.preferenceId,
      });
      return { ...result, payment: existingPayment };
    }
    if (!this.paymentGateway) {
      const order = await this.orders.savePaymentMethod(
        result.order.id,
        "whatsapp_coordination",
      );
      logDevCommerce("payment.whatsapp_coordination_selected", {
        orderId: order.id,
        publicId: order.publicId,
        reason: "payment_gateway_disabled",
      });
      return { order, reused: result.reused, payment: null };
    }
    if (result.order.deliveryCostMode === "TO_BE_CONFIRMED") {
      return {
        ...result,
        payment: null,
        paymentError: {
          code: "DELIVERY_COST_PENDING",
          message: "Confirmaremos el costo de envío antes de habilitar el pago.",
        },
      };
    }
    try {
      const payment = await this.paymentGateway.createPreference(result.order);
      const order = await this.orders.savePaymentPreference(
        result.order.id,
        payment.preferenceId,
        payment.checkoutUrl,
      );
      logDevCommerce("payment.preference_created", {
        orderId: order.id,
        publicId: order.publicId,
        preferenceId: payment.preferenceId,
      });
      return { order, reused: result.reused, payment };
    } catch (error) {
      const knownError = error instanceof Error ? error : null;
      logDevCommerce("payment.preference_failed", {
        orderId: result.order.id,
        publicId: result.order.publicId,
        errorName: knownError?.name ?? "UnknownError",
        status:
          knownError &&
          "status" in knownError &&
          typeof knownError.status === "number"
            ? knownError.status
            : 502,
      });
      return {
        ...result,
        payment: null,
        paymentError: {
          code: "PAYMENT_PREFERENCE_FAILED",
          message: "El pedido quedó guardado, pero no pudimos preparar Mercado Pago.",
        },
      };
    }
  }
}
