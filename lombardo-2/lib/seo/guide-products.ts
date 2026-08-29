import "server-only";

import { commerceProvider } from "@/lib/commerce";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { Product } from "@/types/commerce";
import type { GuideDefinition } from "./guides";

const PAGE_SIZE = 48;
const MAX_PRICE_SCAN_PAGES = 12;

function canRecommend(product: Product) {
  return product.active && product.availability !== "UNAVAILABLE";
}

function diverseSelection(products: Product[], limit: number) {
  const selected: Product[] = [];
  const usedBrands = new Set<string>();

  for (const product of products) {
    if (usedBrands.has(product.brand.slug)) continue;
    selected.push(product);
    usedBrands.add(product.brand.slug);
    if (selected.length === limit) return selected;
  }

  for (const product of products) {
    if (selected.some((candidate) => candidate.id === product.id)) continue;
    selected.push(product);
    if (selected.length === limit) break;
  }

  return selected;
}

async function loadPriceCappedProducts(
  guide: GuideDefinition,
  pricingContext: CustomerPricingContext,
) {
  const matches: Product[] = [];
  const priceMax = guide.catalog.priceMax ?? Number.POSITIVE_INFINITY;

  for (let pageIndex = 0; pageIndex < MAX_PRICE_SCAN_PAGES; pageIndex += 1) {
    const page = await commerceProvider.getProductPage(
      {
        categorySlug: guide.catalog.categorySlug,
        offset: pageIndex * PAGE_SIZE,
        limit: PAGE_SIZE,
      },
      pricingContext,
    );

    matches.push(
      ...page.products.filter(
        (product) => canRecommend(product) && product.price < priceMax,
      ),
    );

    if (matches.length >= guide.catalog.limit || !page.hasMore) break;
  }

  return diverseSelection(matches, guide.catalog.limit);
}

export async function loadGuideProducts(
  guide: GuideDefinition,
  pricingContext: CustomerPricingContext,
) {
  if (guide.catalog.mode === "price-cap") {
    return loadPriceCappedProducts(guide, pricingContext);
  }

  if (guide.catalog.mode === "search-list") {
    const pages = await Promise.all(
      (guide.catalog.searchTerms ?? []).map((search) =>
        commerceProvider.getProductPage(
          { categorySlug: guide.catalog.categorySlug, search, limit: 8 },
          pricingContext,
        ),
      ),
    );
    const matches = pages.flatMap((page) => page.products.slice(0, 1)).filter(canRecommend);
    if (matches.length >= guide.catalog.limit) return diverseSelection(matches, guide.catalog.limit);

    const fallback = await commerceProvider.getProductPage(
      { categorySlug: guide.catalog.categorySlug, limit: PAGE_SIZE },
      pricingContext,
    );
    return diverseSelection(
      [...matches, ...fallback.products.filter(canRecommend)],
      guide.catalog.limit,
    );
  }

  const page = await commerceProvider.getProductPage(
    {
      categorySlug: guide.catalog.categorySlug,
      search: guide.catalog.mode === "search" ? guide.catalog.search : undefined,
      limit: PAGE_SIZE,
    },
    pricingContext,
  );

  return diverseSelection(
    page.products.filter(canRecommend),
    guide.catalog.limit,
  );
}

export async function loadGuideCoverProducts(
  pricingContext: CustomerPricingContext,
) {
  const page = await commerceProvider.getProductPage(
    { categorySlug: "vinos", limit: 24 },
    pricingContext,
  );

  return diverseSelection(
    page.products.filter((product) => canRecommend(product) && product.images.length > 0),
    8,
  );
}
