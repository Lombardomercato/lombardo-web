import type { Category, Product } from "@/types/commerce";
import type { CustomerPricingContext } from "@/lib/server/customers/types";

export const CATALOG_PAGE_SIZE = 24;
export const CATALOG_MAX_PAGE_SIZE = 48;

export interface ProductPageQuery {
  offset?: number;
  limit?: number;
  search?: string;
  categorySlug?: string;
}

export interface ProductPage {
  products: Product[];
  total: number;
  offset: number;
  limit: number;
  hasMore: boolean;
  queryTimeMs: number;
}

export interface IndexableProduct {
  slug: string;
  categorySlug: string;
}

export interface CommerceProvider {
  getProductPage(
    query?: ProductPageQuery,
    pricingContext?: CustomerPricingContext,
  ): Promise<ProductPage>;
  getProductsByIds(
    productIds: string[],
    pricingContext?: CustomerPricingContext,
  ): Promise<Product[]>;
  getProductBySlug(
    slug: string,
    pricingContext?: CustomerPricingContext,
  ): Promise<Product | null>;
  getActiveOpportunities(
    limit?: number,
    pricingContext?: CustomerPricingContext,
  ): Promise<Product[]>;
  getIndexableProducts(): Promise<IndexableProduct[]>;
  getCategories(): Promise<Category[]>;
}
