import type { AvailabilityStatus } from "./commerce";
import type {
  CustomerPricingPolicy,
  SupplierSalePriceType,
} from "../lib/server/customers/types";

export type DeliveryMethod =
  | "PICKUP"
  | "DELIVERY"
  | "DELIVERY_ROSARIO"
  | "DELIVERY_SOUTH";
export type DeliveryCostMode = "FREE" | "FLAT_RATE" | "TO_BE_CONFIRMED";
export type OrderStatus = "pending_payment" | "confirmed" | "cancelled";
export type PaymentStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "refunded";
export type PaymentMethod =
  | "mercado_pago"
  | "whatsapp_coordination"
  | "bank_transfer"
  | "cash";
export type OrderCurrency = "ARS";
export type OrderSource = "storefront" | "admin_manual" | "whatsapp";

export interface OrderChannelContext {
  channel: "whatsapp";
  conversationSessionId: string;
  contactId?: string;
}

export interface InvoiceDetails {
  type: "A";
  businessName: string;
  cuit: string;
  taxCondition?: string;
}

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
  couponCode?: string;
  paymentMethod?: PaymentMethod;
  orderSource?: OrderSource;
  channelContext?: OrderChannelContext;
  invoiceDetails?: InvoiceDetails;
  customerNotes?: string;
}

export interface OrderItemSnapshot {
  productId: string;
  sourceProductId?: string;
  sku: string;
  name: string;
  categorySlug?: string;
  catalogUnitPrice?: number;
  manualPriceOverride?: boolean;
  baseUnitPrice: number;
  priceType: SupplierSalePriceType;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  discountAmount: number;
  commercialUnitPrice?: number;
  policyDiscountAmount?: number;
  couponDiscountAmount?: number;
  finalUnitPrice?: number;
  unitPrice: number;
  quantity: number;
  lineBaseTotal: number;
  lineDiscount: number;
  lineCommercialTotal?: number;
  lineCouponDiscount?: number;
  lineFinalTotal?: number;
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
  orderSource?: OrderSource;
  channelContext?: OrderChannelContext;
  invoiceDetails?: InvoiceDetails;
  customerNotes?: string;
  items: OrderItemSnapshot[];
  customer: CheckoutCustomer;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  deliveryCostMode: DeliveryCostMode;
  baseSubtotal: number;
  pricingDiscountAmount: number;
  commercialSubtotal?: number;
  promotionId?: string;
  couponCode?: string;
  couponDiscountType?: "PERCENTAGE" | "FIXED_AMOUNT";
  couponDiscountValue?: number;
  couponDiscountAmount?: number;
  couponStackable?: boolean;
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
  | "PRICE_CHANGED"
  | "PROMOTION_NOT_FOUND"
  | "PROMOTION_INACTIVE"
  | "PROMOTION_SCHEDULED"
  | "PROMOTION_EXPIRED"
  | "PROMOTION_MINIMUM"
  | "PROMOTION_EXHAUSTED"
  | "PROMOTION_ALREADY_USED"
  | "PROMOTION_NOT_APPLICABLE"
  | "PROMOTION_NOT_STACKABLE"
  | "PROMOTION_FIRST_ORDER_ONLY";

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
