export type CommerceEvent =
  | { name: "view_item"; productId: string }
  | { name: "add_to_cart"; productId: string; quantity: number }
  | { name: "remove_from_cart"; productId: string; quantity: number }
  | { name: "view_cart"; itemCount: number; subtotal: number }
  | { name: "begin_checkout"; itemCount: number; subtotal: number }
  | { name: "add_shipping_info"; method: "PICKUP" | "DELIVERY" }
  | { name: "purchase"; orderId: string; total: number; currency: "ARS" };

/**
 * Typed seam for the future analytics adapter. Intentionally does not emit yet.
 */
export function trackCommerceEvent(event: CommerceEvent) {
  void event;
}
