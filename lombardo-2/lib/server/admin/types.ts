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
  retailPrice: number | null;
  active: boolean;
  eligibilityStatus: "safe" | "blocked" | "pending_review" | "supplier_only_cost";
  publicationStatus: "published" | "not_published";
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
