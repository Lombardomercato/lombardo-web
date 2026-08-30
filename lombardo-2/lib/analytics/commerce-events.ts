export type CommerceEvent =
  | { name: "view_item"; productId: string }
  | { name: "add_to_cart"; productId: string; quantity: number }
  | { name: "remove_from_cart"; productId: string; quantity: number }
  | { name: "view_cart"; itemCount: number; subtotal: number }
  | { name: "begin_checkout"; itemCount: number; subtotal: number }
  | { name: "add_shipping_info"; method: "PICKUP" | "DELIVERY" }
  | { name: "purchase"; orderId: string; total: number; currency: "ARS" }
  | { name: "guide_view"; guideSlug: string }
  | { name: "guide_product_click"; guideSlug: string; productId: string }
  | { name: "guide_add_to_cart"; guideSlug: string; productId: string }
  | { name: "guide_share"; guideSlug: string; channel: "native" | "copy" }
  | { name: "guide_related_click"; guideSlug: string; relatedSlug: string };

export function trackCommerceEvent(event: CommerceEvent) {
  if (typeof window === "undefined") return;

  const detail = { ...event, event: event.name };
  window.dispatchEvent(new CustomEvent("lombardo:analytics", { detail }));

  const analyticsWindow = window as Window & {
    dataLayer?: Array<Record<string, unknown>>;
  };
  analyticsWindow.dataLayer?.push(detail);
}
