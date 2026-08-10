import { mockCategories, mockProducts } from "@/data/mock-products";
import type { CommerceProvider, ProductQuery } from "./provider";

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

export class LocalCommerceProvider implements CommerceProvider {
  async getProducts(query: ProductQuery = {}) {
    const { categorySlug, featured, activeOnly = true } = query;

    return mockProducts.filter((product) => {
      if (activeOnly && !product.active) return false;
      if (categorySlug && product.category.slug !== categorySlug) return false;
      if (featured !== undefined && product.featured !== featured) return false;
      return true;
    });
  }

  async getProductBySlug(slug: string) {
    return mockProducts.find((product) => product.slug === slug) ?? null;
  }

  async getCategories() {
    return [...mockCategories];
  }

  async searchProducts(term: string) {
    const query = normalize(term);
    if (!query) return this.getProducts();

    return mockProducts.filter((product) => {
      if (!product.active) return false;

      const searchable = normalize(
        [
          product.name,
          product.description,
          product.brand.name,
          product.category.name,
          ...product.tags,
          ...product.situations,
        ].join(" "),
      );

      return searchable.includes(query);
    });
  }
}
