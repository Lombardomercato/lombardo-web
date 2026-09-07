import type { DeliveryMethod } from "@/types/checkout";

export type CommerceEvent =
  | { name: "view_item"; productId: string }
  | { name: "add_to_cart"; productId: string; quantity: number }
  | { name: "remove_from_cart"; productId: string; quantity: number }
  | { name: "view_cart"; itemCount: number; subtotal: number }
  | { name: "begin_checkout"; itemCount: number; subtotal: number }
  | { name: "add_shipping_info"; method: DeliveryMethod }
  | { name: "purchase"; orderId: string; total: number; currency: "ARS" }
  | { name: "opportunity_view"; productId: string; surface: "home" | "opportunities" | "product" }
  | { name: "opportunity_product_click"; productId: string; surface: "home" | "opportunities" }
  | { name: "opportunity_add_to_cart"; productId: string; quantity: number }
  | { name: "opportunity_order"; orderId: string; productId: string; quantity: number; total: number }
  | { name: "guide_view"; guideSlug: string }
  | { name: "guide_product_click"; guideSlug: string; productId: string }
  | { name: "guide_add_to_cart"; guideSlug: string; productId: string }
  | { name: "guide_share"; guideSlug: string; channel: "native" | "copy" }
  | { name: "guide_related_click"; guideSlug: string; relatedSlug: string }
  | { name: "wholesale_progress_seen"; bottleCount: number }
  | { name: "wholesale_progress_clicked"; bottleCount: number }
  | { name: "wholesale_threshold_reached"; bottleCount: number }
  | { name: "wholesale_price_applied"; bottleCount: number }
  | { name: "wholesale_recommendation_clicked"; bottleCount: number; productId: string }
  | { name: "portal_negocios_opened"; accountType: "WHOLESALE" | "BUSINESS" }
  | { name: "pedido_rapido_opened"; accountType: "WHOLESALE" | "BUSINESS" }
  | { name: "business_account_requested"; source: "empresas" | "mi_cuenta" };

export function trackCommerceEvent(event: CommerceEvent) {
  if (typeof window === "undefined") return;

  const detail = { ...event, event: event.name };
  window.dispatchEvent(new CustomEvent("lombardo:analytics", { detail }));

  const analyticsWindow = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  };
  analyticsWindow.dataLayer?.push(detail);
}
