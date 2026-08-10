import type {
  MercadoPagoPayment,
  OrderDraft,
  PaymentPreferenceResult,
} from "../../../types/checkout.ts";

export interface PaymentGateway {
  createPreference(order: OrderDraft): Promise<PaymentPreferenceResult>;
  getPayment(paymentId: string): Promise<MercadoPagoPayment>;
}

export class PaymentGatewayError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PaymentGatewayError";
    this.status = status;
  }
}
