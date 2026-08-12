import type { Category, Product } from "@/types/commerce";

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

export interface CommerceProvider {
  getProductPage(query?: ProductPageQuery): Promise<ProductPage>;
  getProductsByIds(productIds: string[]): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getCategories(): Promise<Category[]>;
}
