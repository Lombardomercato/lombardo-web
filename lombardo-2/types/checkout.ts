import type { AvailabilityStatus } from "./commerce";
import type {
  CustomerPricingPolicy,
  SupplierSalePriceType,
} from "../lib/server/customers/types";

export type DeliveryMethod = "PICKUP" | "DELIVERY";
export type DeliveryCostMode = "FREE" | "FLAT_RATE" | "TO_BE_CONFIRMED";
export type OrderStatus = "pending_payment" | "confirmed" | "cancelled";
export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded";
export type PaymentMethod = "mercado_pago" | "whatsapp_coordination";
export type OrderCurrency = "ARS";

export interface CheckoutCustomer {
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  dni?: string;
}

export interface DeliveryAddress {
  street: string;
  number: string;
  floorApartment?: string;
  city: string;
  province: string;
  postalCode?: string;
  references?: string;
}

export interface DeliveryQuote {
  mode: DeliveryCostMode;
  amount: number;
  label: string;
}

export interface CheckoutItemInput {
  productId: string;
  quantity: number;
  expectedUnitPrice: number;
}

export interface CreateOrderInput {
  checkoutSessionId: string;
  idempotencyKey: string;
  items: CheckoutItemInput[];
  customer: CheckoutCustomer;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
}

export interface OrderItemSnapshot {
  productId: string;
  sourceProductId?: string;
  sku: string;
  name: string;
  baseUnitPrice: number;
  priceType: SupplierSalePriceType;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  discountAmount: number;
  unitPrice: number;
  quantity: number;
  lineBaseTotal: number;
  lineDiscount: number;
  lineTotal: number;
}

export interface CartValidationItem {
  productId: string;
  expectedUnitPrice: number;
  quantity: number;
  availability: AvailabilityStatus;
}

export interface CheckoutDraft {
  tenantId: string;
  tenantRecordId: string;
  customerAccountId?: string;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  checkoutSessionId: string;
  idempotencyKey: string;
  items: OrderItemSnapshot[];
  customer: CheckoutCustomer;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  deliveryCostMode: DeliveryCostMode;
  baseSubtotal: number;
  pricingDiscountAmount: number;
  subtotal: number;
  deliveryCost: number;
  total: number;
  currency: OrderCurrency;
}

export interface OrderDraft extends CheckoutDraft {
  id: string;
  publicId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentPreferenceId?: string;
  paymentCheckoutUrl?: string;
  paymentProviderId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentPreferenceResult {
  preferenceId: string;
  checkoutUrl: string;
}

export interface CreateOrderResult {
  order: OrderDraft;
  reused: boolean;
  payment: PaymentPreferenceResult | null;
  paymentError?: {
    code: "PAYMENT_NOT_CONFIGURED" | "DELIVERY_COST_PENDING" | "PAYMENT_PREFERENCE_FAILED";
    message: string;
  };
}

export interface PublicOrderStatus {
  publicId: string;
  displayId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  deliveryMethod: DeliveryMethod;
  deliveryCostMode: DeliveryCostMode;
  total: number;
  currency: OrderCurrency;
  paymentCheckoutUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface WhatsAppCoordinationResult {
  order: OrderDraft;
  whatsappUrl: string;
}

export interface PriceChange {
  productId: string;
  name: string;
  expectedUnitPrice: number;
  currentUnitPrice: number;
}

export type CartValidationErrorCode =
  | "EMPTY_CART"
  | "INVALID_PRODUCT"
  | "PRODUCT_UNAVAILABLE"
  | "QUANTITY_INVALID"
  | "PRICE_CHANGED";

export type CartValidationResult =
  | { valid: true; items: OrderItemSnapshot[] }
  | {
      valid: false;
      code: CartValidationErrorCode;
      message: string;
      productId?: string;
      priceChanges?: PriceChange[];
    };

export type OrderRepositoryErrorCode =
  | CartValidationErrorCode
  | "INVALID_REQUEST"
  | "CREATE_FAILED"
  | "DUPLICATE_SESSION"
  | "ORDER_NOT_FOUND"
  | "SERVER_NOT_CONFIGURED"
  | "PAYMENT_NOT_CONFIGURED"
  | "DELIVERY_COST_PENDING"
  | "PAYMENT_PREFERENCE_FAILED";

export interface OrderRepositoryErrorPayload {
  code: OrderRepositoryErrorCode;
  message: string;
  priceChanges?: PriceChange[];
}

export interface MercadoPagoPayment {
  id: string;
  status: string;
  externalReference: string | null;
  transactionAmount: number;
  currencyId: string;
  liveMode: boolean;
  metadata?: Record<string, unknown>;
}
