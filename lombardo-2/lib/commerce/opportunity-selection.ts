import { canAddToCart } from "@/lib/commerce/availability";
import type { Product } from "@/types/commerce";

export interface OpportunitySelection {
  products: Product[];
  recommendedProductId?: string;
}

export function completeOpportunitySelection(
  opportunities: Product[],
  candidates: Product[],
): OpportunitySelection {
  if (opportunities.length !== 5) return { products: opportunities };

  const opportunityIds = new Set(opportunities.map((product) => product.id));
  const recommendation = candidates.find((product) =>
    !opportunityIds.has(product.id) &&
    !product.opportunity &&
    product.images.length > 0 &&
    canAddToCart(product.availability));

  return recommendation
    ? {
        products: [...opportunities, recommendation],
        recommendedProductId: recommendation.id,
      }
    : { products: opportunities };
}
