import type { CustomerPricingContext } from "../server/customers/types.ts";
import type { Product } from "../../types/commerce.ts";

export const WHOLESALE_BOTTLE_MINIMUM = 6;

const BOTTLE_CATEGORIES = new Set(["vinos", "destilados"]);

export interface ProductQuantity {
  productId: string;
  quantity: number;
}

export function bottleUnits(product: Product, quantity: number) {
  if (!BOTTLE_CATEGORIES.has(product.category.slug)) return 0;
  const pack = product.presentation.match(
    /(?:\bx\s*|\b)(\d{1,2})\s*(?:botellas?|unidades?)\b/i,
  );
  const unitsPerItem = pack ? Math.max(1, Number(pack[1])) : 1;
  return Math.max(0, Math.trunc(quantity)) * unitsPerItem;
}

export function qualifiesForWholesaleBottleTier(
  products: Product[],
  quantities: ProductQuantity[],
) {
  const quantityById = new Map(
    quantities.map((item) => [item.productId, item.quantity]),
  );
  return products.reduce(
    (total, product) =>
      total + bottleUnits(product, quantityById.get(product.id) ?? 0),
    0,
  ) >= WHOLESALE_BOTTLE_MINIMUM;
}

export function wholesaleTierPricingContext(
  context: CustomerPricingContext,
): CustomerPricingContext {
  return {
    ...context,
    accountType: "WHOLESALE",
    policy: "WHOLESALE",
    basePriceType: "wholesale",
    discountPercent: 0,
    contextKey: context.contextKey,
  };
}

export async function resolveVolumeTierProducts(input: {
  products: Product[];
  quantities: ProductQuantity[];
  pricingContext: CustomerPricingContext;
  loadWholesale: (productIds: string[]) => Promise<Product[]>;
}) {
  const { products, quantities, pricingContext } = input;
  if (
    pricingContext.policy !== "RETAIL" ||
    !qualifiesForWholesaleBottleTier(products, quantities)
  ) {
    return { products, applied: false };
  }

  const eligibleIds = products
    .filter((product) => BOTTLE_CATEGORIES.has(product.category.slug))
    .map((product) => product.id);
  const wholesale = await input.loadWholesale(eligibleIds);
  const wholesaleById = new Map(wholesale.map((product) => [product.id, product]));
  let applied = false;
  const resolved = products.map((product) => {
    const candidate = wholesaleById.get(product.id);
    if (!candidate || candidate.price >= product.price) return product;
    applied = true;
    return { ...candidate, pricingContextKey: pricingContext.contextKey };
  });
  return { products: resolved, applied };
}
