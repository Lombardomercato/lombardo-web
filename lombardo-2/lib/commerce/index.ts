import { unstable_cache } from "next/cache";
import { RuniaCommerceProvider } from "./runia-commerce-provider";
import { readRuniaConfiguration } from "../server/environment";
import type { CommerceProvider, ProductPageQuery } from "./provider";

export type {
  CommerceProvider,
  ProductPage,
  ProductPageQuery,
} from "./provider";
export {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
} from "./provider";
export { RuniaCommerceProvider } from "./runia-commerce-provider";

let runiaProvider: RuniaCommerceProvider | null = null;

function getRuniaProvider() {
  runiaProvider ??= new RuniaCommerceProvider(readRuniaConfiguration());
  return runiaProvider;
}

const cachedProductPage = unstable_cache(
  (
    offset: number | undefined,
    limit: number | undefined,
    search: string | undefined,
    categorySlug: string | undefined,
  ) =>
    getRuniaProvider().getProductPage({
      offset,
      limit,
      search,
      categorySlug,
    }),
  ["runia-real-catalog-page-v1"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

const cachedProductsByIds = unstable_cache(
  (ids: string) => getRuniaProvider().getProductsByIds(ids.split(",")),
  ["runia-real-catalog-products-by-id-v1"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

const cachedProductBySlug = unstable_cache(
  (slug: string) => getRuniaProvider().getProductBySlug(slug),
  ["runia-real-catalog-product-by-slug-v1"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

export const commerceProvider: CommerceProvider = {
  getProductPage: (query: ProductPageQuery = {}) =>
    cachedProductPage(
      query.offset,
      query.limit,
      query.search,
      query.categorySlug,
    ),
  getProductsByIds: (productIds) => {
    const ids = Array.from(new Set(productIds)).sort().join(",");
    return ids ? cachedProductsByIds(ids) : Promise.resolve([]);
  },
  getProductBySlug: (slug) => cachedProductBySlug(slug),
  getCategories: () => getRuniaProvider().getCategories(),
};
