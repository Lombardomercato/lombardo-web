import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderDraft,
  PaymentPreferenceResult,
} from "../../../types/checkout.ts";
import type { ServerOrderRepository } from "../orders/order-dependencies.ts";
import { logDevCommerce } from "../dev-commerce-logger.ts";
import type { PaymentGateway } from "./payment-gateway.ts";

interface OrderPaymentCoordinatorOptions {
  orders: ServerOrderRepository;
  paymentGateway: PaymentGateway | null;
}

export class OrderPaymentCoordinator {
  private readonly orders: ServerOrderRepository;
  private readonly paymentGateway: PaymentGateway | null;

  constructor(options: OrderPaymentCoordinatorOptions) {
    this.orders = options.orders;
    this.paymentGateway = options.paymentGateway;
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
    } catch {
      logDevCommerce("payment.preference_failed", {
        orderId: result.order.id,
        publicId: result.order.publicId,
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
