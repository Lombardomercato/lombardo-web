import type {
  CheckoutDraft,
  CreateOrderInput,
  DeliveryMethod,
  DeliveryService,
  DeliveryQuote,
  OrderDraft,
  PaymentMethod,
  PaymentStatus,
  PublicOrderStatus,
  OrderStatus,
} from "../../../types/checkout.ts";
import type { Product } from "../../../types/commerce.ts";

export interface ServerProductSource {
  getProductsByIds(productIds: string[]): Promise<Product[]>;
}

export interface ServerDeliveryPricing {
  getQuote(method: DeliveryMethod, service?: DeliveryService): DeliveryQuote;
}

export interface NewOrderRecord extends CheckoutDraft {
  publicId: string;
  orderStatus: "pending_payment";
  paymentStatus: "pending";
  paymentMethod: PaymentMethod;
}

export interface AtomicInsertResult {
  order: OrderDraft;
  reused: boolean;
}

export interface PaymentEventInput {
  tenantId: string;
  orderId: string;
  eventId: string;
  providerPaymentId: string;
  providerStatus: string;
  payload: Record<string, unknown>;
}

export interface PaymentStateUpdate {
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  paymentProviderId: string;
}

export interface AppliedPaymentEvent {
  duplicate: boolean;
  order: OrderDraft;
}

export interface RuniaOrderStore {
  findByIdempotency(
    tenantId: string,
    checkoutSessionId: string,
    idempotencyKey: string,
  ): Promise<OrderDraft | null>;
  insertOrderAtomic(record: NewOrderRecord): Promise<AtomicInsertResult>;
  getByPublicId(tenantId: string, publicId: string): Promise<OrderDraft | null>;
  getById(tenantId: string, orderId: string): Promise<OrderDraft | null>;
  savePaymentPreference(
    tenantId: string,
    orderId: string,
    preferenceId: string,
    checkoutUrl: string,
  ): Promise<OrderDraft>;
  savePaymentMethod(
    tenantId: string,
    orderId: string,
    paymentMethod: PaymentMethod,
  ): Promise<OrderDraft>;
  applyPaymentEventAtomic(
    input: PaymentEventInput,
    update: PaymentStateUpdate,
  ): Promise<AppliedPaymentEvent>;
}

export interface ServerOrderRepository {
  createOrder(input: CreateOrderInput): Promise<AtomicInsertResult>;
  getByPublicId(publicId: string): Promise<OrderDraft | null>;
  getById(orderId: string): Promise<OrderDraft | null>;
  savePaymentPreference(
    orderId: string,
    preferenceId: string,
    checkoutUrl: string,
  ): Promise<OrderDraft>;
  savePaymentMethod(
    orderId: string,
    paymentMethod: PaymentMethod,
  ): Promise<OrderDraft>;
  toPublicStatus(order: OrderDraft): PublicOrderStatus;
}
