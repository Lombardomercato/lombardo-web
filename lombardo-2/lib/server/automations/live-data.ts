import "server-only";

import { argentinaDate } from "@/lib/automations/date";
import { commerceProvider } from "@/lib/commerce";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { Category, Product } from "@/types/commerce";
import { createAutomationServices } from ".";

function orderProducts(products: Product[], ids: string[]) {
  const position = new Map(ids.map((id, index) => [id, index]));
  return [...products].sort(
    (left, right) => (position.get(left.id) ?? 999) - (position.get(right.id) ?? 999),
  );
}

export async function loadDailyHomeData(
  pricingContext: CustomerPricingContext,
  categories: Category[],
) {
  const state = await createAutomationServices().store.getHomeDailyState(argentinaDate());
  if (!state?.productIds.length) return null;
  const products = orderProducts(
    await commerceProvider.getProductsByIds(state.productIds, pricingContext),
    state.productIds,
  );
  if (products.length !== state.productIds.length) return null;
  const categoryOrder = new Map(state.categorySlugs.map((slug, index) => [slug, index]));
  return {
    products,
    categories: [...categories].sort(
      (left, right) => (categoryOrder.get(left.slug) ?? 999) - (categoryOrder.get(right.slug) ?? 999),
    ),
    selectionDate: state.selectionDate,
    fallback: state.fallback,
  };
}

export async function loadLiveGuideProducts(
  slug: string,
  pricingContext: CustomerPricingContext,
) {
  const ids = await createAutomationServices().store.contentProductIds(slug);
  if (!ids.length) return [];
  return orderProducts(await commerceProvider.getProductsByIds(ids, pricingContext), ids);
}
