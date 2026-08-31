import { unstable_cache } from "next/cache";
import { RuniaCommerceProvider } from "./runia-commerce-provider";
import { readRuniaConfiguration } from "../server/environment";
import { roundCurrency } from "../pricing/policy";
import {
  retailPricingContext,
  type CustomerAccountType,
  type CustomerPricingContext,
  type CustomerPricingPolicy,
  type SupplierSalePriceType,
} from "../server/customers/types";
import type { Product } from "../../types/commerce";
import type { CommerceProvider, ProductPageQuery } from "./provider";
import type { QuickOrderProvider } from "../quick-order/types";

export type {
  CommerceProvider,
  IndexableProduct,
  ProductPage,
  ProductPageQuery,
} from "./provider";
export {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
} from "./provider";
export { RuniaCommerceProvider } from "./runia-commerce-provider";

let runiaProvider: RuniaCommerceProvider | null = null;
let runiaConfiguration: ReturnType<typeof readRuniaConfiguration> | null = null;

function getRuniaConfiguration() {
  runiaConfiguration ??= readRuniaConfiguration();
  return runiaConfiguration;
}

function getRuniaProvider() {
  runiaProvider ??= new RuniaCommerceProvider(getRuniaConfiguration());
  return runiaProvider;
}

function normalizedPricingContext(pricingContext?: CustomerPricingContext) {
  const context =
    pricingContext ?? retailPricingContext(getRuniaConfiguration().tenantSlug);
  return {
    ...context,
    discountPercent:
      context.policy === "CUSTOM_DISCOUNT"
        ? roundCurrency(context.discountPercent)
        : 0,
  };
}

function accountTypeForPolicy(policy: CustomerPricingPolicy): CustomerAccountType {
  if (policy === "WHOLESALE") return "WHOLESALE";
  if (policy === "BUSINESS") return "BUSINESS";
  return "RETAIL";
}

function cachePricingContext(
  basePriceType: SupplierSalePriceType,
  policy: CustomerPricingPolicy,
  discountPercent: number,
): CustomerPricingContext {
  return {
    tenantSlug: getRuniaConfiguration().tenantSlug,
    accountType: accountTypeForPolicy(policy),
    policy,
    basePriceType,
    discountPercent,
    // The real account context key is deliberately attached after the cached read.
    contextKey: "",
  };
}

function attachPricingIdentity(product: Product, contextKey: string): Product {
  return { ...product, pricingContextKey: contextKey };
}

const cachedProductPage = unstable_cache(
  (
    basePriceType: SupplierSalePriceType,
    policy: CustomerPricingPolicy,
    discountPercent: number,
    offset: number | undefined,
    limit: number | undefined,
    search: string | undefined,
    categorySlug: string | undefined,
  ) =>
    getRuniaProvider().getProductPage(
      {
        offset,
        limit,
        search,
        categorySlug,
      },
      cachePricingContext(basePriceType, policy, discountPercent),
    ),
  ["runia-real-catalog-page-v2"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

const cachedProductsByIds = unstable_cache(
  (
    basePriceType: SupplierSalePriceType,
    policy: CustomerPricingPolicy,
    discountPercent: number,
    ids: string,
  ) =>
    getRuniaProvider().getProductsByIds(
      ids.split(","),
      cachePricingContext(basePriceType, policy, discountPercent),
    ),
  ["runia-real-catalog-products-by-id-v2"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

const cachedProductBySlug = unstable_cache(
  (
    basePriceType: SupplierSalePriceType,
    policy: CustomerPricingPolicy,
    discountPercent: number,
    slug: string,
  ) =>
    getRuniaProvider().getProductBySlug(
      slug,
      cachePricingContext(basePriceType, policy, discountPercent),
    ),
  ["runia-real-catalog-product-by-slug-v2"],
  { revalidate: 300, tags: ["runia-real-catalog"] },
);

const cachedIndexableProducts = unstable_cache(
  () => getRuniaProvider().getIndexableProducts(),
  ["runia-indexable-products-v1"],
  { revalidate: 3600, tags: ["runia-real-catalog"] },
);

const cachedActiveOpportunities = unstable_cache(
  (
    basePriceType: SupplierSalePriceType,
    policy: CustomerPricingPolicy,
    discountPercent: number,
    limit: number,
  ) =>
    getRuniaProvider().getActiveOpportunities(
      limit,
      cachePricingContext(basePriceType, policy, discountPercent),
    ),
  ["runia-active-opportunities-v1"],
  { revalidate: 300, tags: ["runia-real-catalog", "lombardo-opportunities"] },
);

export const commerceProvider: CommerceProvider = {
  getProductPage: async (
    query: ProductPageQuery = {},
    pricingContext?: CustomerPricingContext,
  ) => {
    const context = normalizedPricingContext(pricingContext);
    const page = await cachedProductPage(
      context.basePriceType,
      context.policy,
      context.discountPercent,
      query.offset,
      query.limit,
      query.search,
      query.categorySlug,
    );
    return {
      ...page,
      products: page.products.map((product) =>
        attachPricingIdentity(product, context.contextKey),
      ),
    };
  },
  getProductsByIds: async (productIds, pricingContext) => {
    const ids = Array.from(new Set(productIds)).sort().join(",");
    if (!ids) return [];
    const context = normalizedPricingContext(pricingContext);
    const products = await cachedProductsByIds(
      context.basePriceType,
      context.policy,
      context.discountPercent,
      ids,
    );
    return products.map((product) =>
      attachPricingIdentity(product, context.contextKey),
    );
  },
  getProductBySlug: async (slug, pricingContext) => {
    const context = normalizedPricingContext(pricingContext);
    const product = await cachedProductBySlug(
      context.basePriceType,
      context.policy,
      context.discountPercent,
      slug,
    );
    return product ? attachPricingIdentity(product, context.contextKey) : null;
  },
  getIndexableProducts: () => cachedIndexableProducts(),
  getActiveOpportunities: async (limit = 48, pricingContext) => {
    const context = normalizedPricingContext(pricingContext);
    if (context.basePriceType !== "retail") return [];
    const products = await cachedActiveOpportunities(
      context.basePriceType,
      context.policy,
      context.discountPercent,
      limit,
    );
    return products.map((product) =>
      attachPricingIdentity(product, context.contextKey),
    );
  },
  getCategories: () => getRuniaProvider().getCategories(),
};

export const quickOrderProvider: QuickOrderProvider = {
  searchProducts: async (input, pricingContext) => {
    const result = await getRuniaProvider().searchProducts(input, pricingContext);
    return {
      ...result,
      products: result.products.map((entry) => ({
        ...entry,
        product: attachPricingIdentity(
          entry.product,
          pricingContext.contextKey,
        ),
      })),
    };
  },
};
