import type {
  OrderStatus,
  PaymentStatus,
} from "../../../types/checkout.ts";

export interface PaymentTransition {
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
}

const terminalApprovedStatuses = new Set<PaymentStatus>(["approved", "refunded"]);

export function getPaymentTransition(
  currentPaymentStatus: PaymentStatus,
  currentOrderStatus: OrderStatus,
  providerStatus: string,
): PaymentTransition {
  if (providerStatus === "refunded" || providerStatus === "charged_back") {
    if (currentPaymentStatus === "approved" || currentPaymentStatus === "refunded") {
      return { paymentStatus: "refunded", orderStatus: "cancelled" };
    }
    return { paymentStatus: currentPaymentStatus, orderStatus: currentOrderStatus };
  }

  if (terminalApprovedStatuses.has(currentPaymentStatus)) {
    return { paymentStatus: currentPaymentStatus, orderStatus: currentOrderStatus };
  }
  if (providerStatus === "approved") {
    return { paymentStatus: "approved", orderStatus: "confirmed" };
  }
  if (providerStatus === "rejected") {
    return { paymentStatus: "rejected", orderStatus: "pending_payment" };
  }
  if (providerStatus === "cancelled") {
    return { paymentStatus: "cancelled", orderStatus: "pending_payment" };
  }
  if (["pending", "in_process", "in_mediation", "authorized"].includes(providerStatus)) {
    if (currentPaymentStatus === "rejected" || currentPaymentStatus === "cancelled") {
      return { paymentStatus: currentPaymentStatus, orderStatus: currentOrderStatus };
    }
    return { paymentStatus: "pending", orderStatus: "pending_payment" };
  }
  return { paymentStatus: currentPaymentStatus, orderStatus: currentOrderStatus };
}
