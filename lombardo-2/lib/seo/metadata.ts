import { SITE } from "../config/site.ts";
import type { Product } from "../../types/commerce.ts";

export function absoluteUrl(path = "/") {
  return new URL(path, `${SITE.url}/`).toString();
}

export function productSeoDescription(product: Product) {
  const details = [
    product.brand.name !== product.name ? product.brand.name : null,
    product.presentation,
    product.category.name,
  ].filter(Boolean);

  return `${product.name}. ${details.join(" · ")}. Compralo online en Lombardo, Rosario.`;
}
