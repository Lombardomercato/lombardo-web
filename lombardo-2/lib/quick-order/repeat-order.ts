import type { OrderItemSnapshot } from "@/types/checkout";
import type { Product } from "@/types/commerce";

export interface RevalidatedRepeatOrderItem {
  product: Product;
  quantity: number;
}

export interface RevalidatedRepeatOrder {
  items: RevalidatedRepeatOrderItem[];
  skippedItemCount: number;
}

function safeQuantity(value: unknown) {
  const quantity = Number(value);
  if (!Number.isSafeInteger(quantity) || quantity < 1) return null;
  return Math.min(quantity, 99);
}

/**
 * Rebuilds a previous order exclusively from current server-resolved products.
 * Historical names and price snapshots are intentionally ignored.
 */
export function revalidateRepeatOrderItems(
  historicalItems: OrderItemSnapshot[],
  currentProducts: Product[],
): RevalidatedRepeatOrder {
  const currentById = new Map(
    currentProducts
      .filter(
        (product) => product.active && product.availability !== "UNAVAILABLE",
      )
      .map((product) => [product.id, product]),
  );
  const items: RevalidatedRepeatOrderItem[] = [];
  let skippedItemCount = 0;

  for (const historical of historicalItems.slice(0, 50)) {
    const product = currentById.get(historical.productId);
    const quantity = safeQuantity(historical.quantity);
    if (!product || !quantity) {
      skippedItemCount += 1;
      continue;
    }
    items.push({ product, quantity });
  }

  skippedItemCount += Math.max(historicalItems.length - 50, 0);
  return { items, skippedItemCount };
}
