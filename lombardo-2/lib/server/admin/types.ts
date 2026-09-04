import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  OrderCurrency,
  OrderItemSnapshot,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../../types/checkout";
import type { OrderNotification } from "../notifications/types";
import type {
  CustomerAccountType,
  CustomerPricingPolicy,
} from "../customers/types";
import type {
  PromotionAppliesTo,
  PromotionCustomerScope,
  PromotionDiscountType,
} from "../../promotions/types";

export type FulfillmentStatus =
  | "new"
  | "confirmed"
  | "preparing"
  | "ready"
  | "delivered"
  | "cancelled";

export type AdminRole = "admin" | "operator";

export interface AdminSession {
  operatorId: string;
  authUserId: string;
  tenantId: string;
  displayName: string;
  role: AdminRole;
  expiresAt: string;
}

export interface AdminOrder {
  id: string;
  customerAccountId?: string;
  publicId: string;
  displayId: string;
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  subtotal: number;
  baseSubtotal?: number;
  pricingDiscountAmount?: number;
  commercialSubtotal?: number;
  couponCode?: string;
  couponDiscountAmount?: number;
  deliveryCost: number;
  deliveryCostSource: "checkout" | "manual" | "automation";
  deliveryCostUpdatedAt?: string;
  total: number;
  commerceTotal: number;
  currency: OrderCurrency;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentProviderId?: string;
  paymentPreferenceId?: string;
  paymentManuallyUpdatedAt?: string;
  fulfillmentStatus: FulfillmentStatus;
  orderSource: "storefront" | "admin_manual";
  hasManagementOverride: boolean;
  manualDiscountAmount?: number;
  manualDiscountReason?: string;
  managementNotes?: string;
  managementRevision: number;
  managementUpdatedAt?: string;
  fulfillmentUpdatedAt: string;
  confirmedAt?: string;
  preparingAt?: string;
  readyAt?: string;
  deliveredAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
  newOrderNotification?: OrderNotification;
  customerOrderConfirmation?: OrderNotification;
  customerStatusNotifications?: OrderNotification[];
}

export interface AdminOrderManagementInput {
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  itemsSubtotal: number;
  discountAmount: number;
  discountReason?: string;
  subtotal: number;
  deliveryCost: number;
  total: number;
  notes?: string;
  paymentStatus?: Extract<PaymentStatus, "pending" | "approved">;
}

export interface AdminDashboard {
  todayOrders: number;
  todayRevenue: number;
  newOrders: number;
  preparingOrders: number;
  readyOrders: number;
  pendingPaymentOrders: number;
  recentOrders: AdminOrder[];
}

export interface AdminOrderFilters {
  fulfillment?: FulfillmentStatus;
  payment?: PaymentStatus;
  delivery?: DeliveryMethod;
  from?: string;
  to?: string;
  search?: string;
}

export interface AdminProduct {
  id: string;
  sku: string;
  name: string;
  presentation: string;
  category: string;
  categorySlug: string;
  brand: string;
  retailPrice: number | null;
  imageUrl?: string;
  active: boolean;
  eligibilityStatus: "safe" | "blocked" | "pending_review" | "supplier_only_cost";
  publicationStatus: "published" | "not_published";
}

export type SupplierPriceType = "retail" | "wholesale" | "business" | "cost";

export interface AdminProductPrice {
  type: SupplierPriceType;
  value: number | null;
  origin: "current" | "candidate" | "unavailable";
}

export interface AdminProductMedia {
  id: string;
  url: string;
  alt: string;
  position: number;
  isPrimary: boolean;
  source: "manual_upload" | "supplier" | "brand_asset" | "external_approved";
  sourceUrl?: string;
  byteSize: number;
  mimeType: string;
}

export interface AdminProductEditorial {
  nameOverride?: string;
  brandName?: string;
  categorySlug?: string;
  description?: string;
  tags: string[];
  internalNotes?: string;
  status: "draft" | "approved";
}

export interface AdminProductDetail extends AdminProduct {
  supplierName: string;
  rawName: string;
  rawPresentation: string;
  prices: AdminProductPrice[];
  media: AdminProductMedia[];
  editorial: AdminProductEditorial;
  anomalies: AdminCatalogAnomaly[];
  lastSeen: string;
}

export interface AdminCatalogAnomaly {
  id: string;
  type: string;
  severity: string;
  status: string;
  priceType?: string;
  message: string;
  observedPrice?: number;
  lastDetectedAt: string;
}

export interface VinrosHealth {
  status: "ok" | "attention" | "blocked";
  lastSyncAt?: string;
  nextSyncAt: string;
  total: number;
  safe: number;
  blocked: number;
  pendingReview: number;
  supplierOnlyCost: number;
  lastWriteAt?: string;
  pricesUpdated: number;
  alerts: Array<{ message: string; severity: string; at: string }>;
}

export interface VinrosReviewProduct extends AdminProductDetail {
  reviewReason: string;
}

export type MatchConfidenceBand = "high" | "medium" | "low";
export type MatchReviewStatus = "pending" | "approved" | "rejected";
export type ImageQualityStatus =
  | "unreviewed"
  | "auto_published"
  | "needs_review"
  | "correct"
  | "corrected"
  | "rejected"
  | "removed"
  | "search_requested";

export interface AdminImageCandidate {
  id: string;
  matchId?: string;
  productId: string;
  sku: string;
  productName: string;
  presentation: string;
  category: string;
  externalProductName: string;
  externalPresentation: string;
  source: string;
  sourceUrl: string;
  imageUrl: string;
  confidence: number;
  confidenceBand: MatchConfidenceBand;
  evidence: string[];
  mismatchWarnings: string[];
  reviewRiskRank: 1 | 2 | 3 | 4 | 5 | 6;
  reviewRiskKind: "product" | "brand_line" | "varietal" | "presentation_volume" | "pack_unit" | "confidence";
  reviewRiskReason: string;
  reviewPriorityScore: number;
  matchReviewStatus: MatchReviewStatus;
  publicationStatus: "pending" | "approved" | "rejected";
  rightsStatus: "unknown" | "licensed" | "approved" | "restricted";
  qualityStatus: ImageQualityStatus;
  createdAt: string;
}

export interface AdminImageCandidatePage {
  candidates: AdminImageCandidate[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface AdminProductImageRender {
  id: string;
  productId: string;
  sku: string;
  name: string;
  brand: string;
  presentation: string;
  price: number | null;
  masterUrl: string;
  masterAlt: string;
  source: string;
  sourceUrl?: string;
  variant: "wine" | "spirits" | "beer" | "gourmet" | "gifts";
  renderVersion: number;
}

export interface AdminUnmatchedImageProduct {
  id: string;
  sku: string;
  name: string;
  presentation: string;
}

export interface AdminUnmatchedImageProductPage {
  products: AdminUnmatchedImageProduct[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface AdminProductPage {
  products: AdminProduct[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
}

export interface AdminCustomer {
  id: string;
  authUserId?: string;
  name: string;
  email: string;
  whatsapp: string;
  accountType: CustomerAccountType;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  status: "active" | "inactive" | "pending" | "blocked";
  orderCount: number;
  lastOrderAt?: string;
  historicalTotal: number;
  createdAt: string;
  updatedAt: string;
  defaultAddress?: DeliveryAddress;
}

export interface AdminCustomerDetail extends AdminCustomer {
  orders: AdminOrder[];
}

export interface AdminCustomerInput {
  name: string;
  email: string;
  whatsapp: string;
  accountType: CustomerAccountType;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  status: AdminCustomer["status"];
}

export interface AdminPromotion {
  id: string;
  code: string;
  name: string;
  description: string;
  status: "ACTIVE" | "INACTIVE";
  discountType: PromotionDiscountType;
  discountValue: number;
  startAt?: string;
  endAt?: string;
  minimumOrderAmount: number;
  maxTotalUses?: number;
  maxUsesPerCustomer?: number;
  appliesTo: PromotionAppliesTo;
  customerScope: PromotionCustomerScope;
  stackable: boolean;
  firstOrderOnly: boolean;
  productIds: string[];
  categorySlugs: string[];
  customerAccountIds: string[];
  reservedUses: number;
  consumedUses: number;
  createdAt: string;
  updatedAt: string;
  uses: Array<{
    id: string;
    orderId: string;
    customerAccountId?: string;
    status: "RESERVED" | "CONSUMED" | "RELEASED";
    discountAmount: number;
    reservedAt: string;
    reservationExpiresAt: string;
    consumedAt?: string;
    releasedAt?: string;
  }>;
}

export interface AdminPromotionInput {
  code: string;
  name: string;
  description: string;
  status: AdminPromotion["status"];
  discountType: PromotionDiscountType;
  discountValue: number;
  startAt?: string;
  endAt?: string;
  minimumOrderAmount: number;
  maxTotalUses?: number;
  maxUsesPerCustomer?: number;
  appliesTo: PromotionAppliesTo;
  customerScope: PromotionCustomerScope;
  stackable: boolean;
  firstOrderOnly: boolean;
  productIds: string[];
  categorySlugs: string[];
  customerAccountIds: string[];
}

export interface FulfillmentTransitionResult {
  changed: boolean;
  order: AdminOrder;
}

export interface AdminOrderUpdateResult {
  changed: boolean;
  eventId?: string;
  order: AdminOrder;
}
