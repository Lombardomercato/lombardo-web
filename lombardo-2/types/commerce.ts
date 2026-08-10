export interface Brand {
  id: string;
  slug: string;
  name: string;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description?: string;
}

export interface ProductImage {
  id: string;
  src: string;
  alt: string;
  width?: number;
  height?: number;
  position?: number;
}

export interface Stock {
  available: boolean;
  quantity: number;
}

export type AvailabilityStatus =
  | "AVAILABLE_NOW"
  | "SUPPLIER_AVAILABLE"
  | "UNAVAILABLE";

export type GiftLevel = "simple" | "especial" | "notable";
export type Situation = string;

export interface Product {
  id: string;
  sourceProductId?: string;
  sku: string;
  slug: string;
  name: string;
  description: string;
  presentation: string;
  brand: Brand;
  category: Category;
  price: number;
  compareAtPrice?: number;
  availability: AvailabilityStatus;
  stock: Stock;
  images: ProductImage[];
  active: boolean;
  featured: boolean;
  situations: Situation[];
  giftLevels: GiftLevel[];
  tags: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
}
