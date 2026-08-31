import type { CheckoutCustomer, DeliveryAddress, DeliveryMethod } from "@/types/checkout";

export interface AdminOrderLineDraft {
  productId: string;
  quantity: number;
  unitPrice: number;
}

export interface AdminOrderFormPayload {
  customer: CheckoutCustomer;
  items: AdminOrderLineDraft[];
  deliveryMethod: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  deliveryCost: number;
  discountAmount: number;
  discountReason?: string;
  notes?: string;
  paymentStatus?: "pending" | "approved";
}

export interface AdminOrderProductOption {
  id: string;
  sku: string;
  name: string;
  presentation: string;
  retailPrice: number;
}

export interface AdminOrderEditableLine extends AdminOrderLineDraft {
  sku: string;
  name: string;
  presentation?: string;
  catalogUnitPrice: number;
}
