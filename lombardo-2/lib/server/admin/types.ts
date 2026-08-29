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
  publicId: string;
  displayId: string;
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  subtotal: number;
  deliveryCost: number;
  total: number;
  currency: OrderCurrency;
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  paymentProviderId?: string;
  paymentPreferenceId?: string;
  fulfillmentStatus: FulfillmentStatus;
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

export interface AdminImageCandidate {
  id: string;
  matchId?: string;
  productId: string;
  sku: string;
  productName: string;
  presentation: string;
  category: string;
  externalProductName: string;
  source: string;
  sourceUrl: string;
  imageUrl: string;
  confidence: number;
  confidenceBand: MatchConfidenceBand;
  evidence: string[];
  mismatchWarnings: string[];
  matchReviewStatus: MatchReviewStatus;
  publicationStatus: "pending" | "approved" | "rejected";
  rightsStatus: "unknown" | "licensed" | "approved" | "restricted";
  createdAt: string;
}

export interface AdminImageCandidatePage {
  candidates: AdminImageCandidate[];
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
  key: string;
  name: string;
  whatsapp: string;
  orderCount: number;
  lastOrderAt: string;
  historicalTotal: number;
}

export interface FulfillmentTransitionResult {
  changed: boolean;
  order: AdminOrder;
}
