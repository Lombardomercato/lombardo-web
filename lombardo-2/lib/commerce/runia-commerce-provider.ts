import { mockCategories, mockProducts } from "../../data/mock-products.ts";
import type { Category, Product } from "../../types/commerce.ts";
import type { ServerProductSource } from "../server/orders/order-dependencies.ts";
import { ServerOrderError } from "../server/orders/server-order-error.ts";
import type { CommerceProvider, ProductQuery } from "./provider.ts";

const MAX_SANDBOX_PRODUCTS = 5;

interface RuniaCommerceProviderOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

interface RuniaDevProductRow {
  public_product_id: string;
  runia_product_id: string;
  runia_sku: string;
  display_name: string;
  eligibility_status: "safe";
  lombardo_sale_price: number | string;
  currency: "ARS";
  available_now: boolean;
  sandbox_quantity: number;
  enabled_for_sandbox: boolean;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

function providerError(message: string): never {
  throw new ServerOrderError("SERVER_NOT_CONFIGURED", message, { status: 503 });
}

export class RuniaCommerceProvider
  implements CommerceProvider, ServerProductSource
{
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantSlug: string;
  private readonly fetcher: typeof fetch;

  constructor(options: RuniaCommerceProviderOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantSlug = options.tenantSlug;
    this.fetcher = options.fetcher ?? fetch;
  }

  private async loadEligibleProducts(): Promise<Product[]> {
    const search = new URLSearchParams({
      select:
        "public_product_id,runia_product_id,runia_sku,display_name,eligibility_status,lombardo_sale_price,currency,available_now,sandbox_quantity,enabled_for_sandbox",
      tenant_slug: `eq.${this.tenantSlug}`,
      eligibility_status: "eq.safe",
      enabled_for_sandbox: "is.true",
      order: "created_at.asc",
      limit: String(MAX_SANDBOX_PRODUCTS + 1),
    });
    const response = await this.fetcher(
      `${this.url}/rest/v1/commerce_lombardo_dev_product_adapter?${search.toString()}`,
      {
        headers: {
          apikey: this.secretKey,
          Authorization: `Bearer ${this.secretKey}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      },
    );
    if (!response.ok) {
      providerError("Runia Dev no pudo entregar el catálogo elegible.");
    }

    const rows = (await response.json()) as RuniaDevProductRow[];
    if (rows.length > MAX_SANDBOX_PRODUCTS) {
      providerError("Runia Dev tiene más de cinco productos habilitados para Sandbox.");
    }

    const templates = new Map(mockProducts.map((product) => [product.id, product]));
    return rows.map((row) => {
      const template = templates.get(row.public_product_id);
      const price = Number(row.lombardo_sale_price);
      if (
        !template ||
        !row.runia_product_id ||
        !row.runia_sku ||
        !row.display_name ||
        row.eligibility_status !== "safe" ||
        row.currency !== "ARS" ||
        !row.enabled_for_sandbox ||
        !Number.isFinite(price) ||
        Math.round(price * 100) !== price * 100 ||
        price <= 0 ||
        !Number.isSafeInteger(row.sandbox_quantity) ||
        row.sandbox_quantity < 0
      ) {
        providerError("El mapping temporal de productos Runia Dev es inválido.");
      }

      const available = row.available_now && row.sandbox_quantity > 0;
      return {
        ...template,
        sourceProductId: row.runia_product_id,
        sku: row.runia_sku,
        name: row.display_name,
        price,
        availability: available ? "AVAILABLE_NOW" : "UNAVAILABLE",
        stock: { available, quantity: available ? row.sandbox_quantity : 0 },
        active: true,
      } satisfies Product;
    });
  }

  async getProducts(query: ProductQuery = {}) {
    const products = await this.loadEligibleProducts();
    const { categorySlug, featured, activeOnly = true } = query;
    return products.filter((product) => {
      if (activeOnly && !product.active) return false;
      if (categorySlug && product.category.slug !== categorySlug) return false;
      if (featured !== undefined && product.featured !== featured) return false;
      return true;
    });
  }

  async getProductsByIds(productIds: string[]) {
    const requested = new Set(productIds);
    return (await this.loadEligibleProducts()).filter((product) =>
      requested.has(product.id),
    );
  }

  async getProductBySlug(slug: string) {
    return (await this.loadEligibleProducts()).find((product) => product.slug === slug) ?? null;
  }

  async getCategories(): Promise<Category[]> {
    const categoryIds = new Set(
      (await this.loadEligibleProducts()).map((product) => product.category.id),
    );
    return mockCategories.filter((category) => categoryIds.has(category.id));
  }

  async searchProducts(term: string) {
    const query = normalize(term);
    const products = await this.loadEligibleProducts();
    if (!query) return products;
    return products.filter((product) =>
      normalize(
        [
          product.name,
          product.description,
          product.brand.name,
          product.category.name,
          ...product.tags,
          ...product.situations,
        ].join(" "),
      ).includes(query),
    );
  }
}
