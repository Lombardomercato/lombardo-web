"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";

export function ClearCartAfterPayment({ orderId, total }: { orderId: string; total: number }) {
  const { clearCart, isHydrated, items } = useCart();
  const cleared = useRef(false);

  useEffect(() => {
    if (cleared.current || !isHydrated) return;
    cleared.current = true;
    for (const item of items.filter((entry) => entry.product.opportunity)) {
      trackCommerceEvent({
        name: "opportunity_order",
        orderId,
        productId: item.product.id,
        quantity: item.quantity,
        total,
      });
    }
    clearCart();
  }, [clearCart, isHydrated, items, orderId, total]);

  return null;
}
