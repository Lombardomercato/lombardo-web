import type { Category, Product } from "@/types/commerce";

export interface ProductQuery {
  categorySlug?: string;
  featured?: boolean;
  activeOnly?: boolean;
}

export interface CommerceProvider {
  getProducts(query?: ProductQuery): Promise<Product[]>;
  getProductBySlug(slug: string): Promise<Product | null>;
  getCategories(): Promise<Category[]>;
  searchProducts(term: string): Promise<Product[]>;
}
