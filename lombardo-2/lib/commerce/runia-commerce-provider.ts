import type { Category, ProductImage } from "../../types/commerce.ts";
import {
  retailPricingContext,
  type CustomerPricingContext,
} from "../server/customers/types.ts";
import type { ServerProductSource } from "../server/orders/order-dependencies.ts";
import { ServerOrderError } from "../server/orders/server-order-error.ts";
import {
  categoryFilterForPostgrest,
  mapRuniaSupplierProduct,
  runiaProductIdFromProductSlug,
  RUNIA_CATALOG_CATEGORIES,
  type RuniaPublicMediaRow,
  type RuniaSupplierProductRow,
} from "./runia-catalog-mapper.ts";
import {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
  type CommerceProvider,
  type ProductPageQuery,
} from "./provider.ts";

const VINROS_SUPPLIER_CODE = "vinros";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface RuniaCommerceProviderOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

interface SupplierRow {
  id: string;
  name: string;
  active: boolean;
  tenants:
    | { slug: string; status: string }
    | Array<{ slug: string; status: string }>
    | null;
}

function providerError(message: string): never {
  throw new ServerOrderError("SERVER_NOT_CONFIGURED", message, { status: 503 });
}

function clampInteger(value: number | undefined, fallback: number, maximum: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(Math.max(Math.trunc(value ?? fallback), 0), maximum);
}

function sanitizedSearch(value: string | undefined) {
  return value
    ?.trim()
    .slice(0, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[%_*,()"'\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function contentRangeTotal(response: Response, fallback: number) {
  const total = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : fallback;
}

export class RuniaCommerceProvider
  implements CommerceProvider, ServerProductSource
{
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantSlug: string;
  private readonly fetcher: typeof fetch;
  private readonly defaultPricingContext: CustomerPricingContext;
  private supplierPromise: Promise<SupplierRow> | null = null;

  constructor(
    options: RuniaCommerceProviderOptions,
    defaultPricingContext = retailPricingContext(options.tenantSlug),
  ) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantSlug = options.tenantSlug;
    this.fetcher = options.fetcher ?? fetch;
    this.defaultPricingContext = defaultPricingContext;
  }

  private headers(preferCount = false) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    if (preferCount) headers.Prefer = "count=exact";
    return headers;
  }

  private async fetchRows<T>(
    table: string,
    search: URLSearchParams,
    preferCount = false,
  ) {
    const startedAt = performance.now();
    const response = await this.fetcher(
      `${this.url}/rest/v1/${table}?${search.toString()}`,
      { headers: this.headers(preferCount), cache: "no-store" },
    );
    const queryTimeMs = performance.now() - startedAt;
    if (!response.ok) {
      providerError("Runia no pudo entregar el catálogo real de VINROS.");
    }
    return {
      rows: (await response.json()) as T[],
      response,
      queryTimeMs,
    };
  }

  private async loadSupplier() {
    const search = new URLSearchParams({
      select: "id,name,active,tenants:tenant_id!inner(slug,status)",
      code: `eq.${VINROS_SUPPLIER_CODE}`,
      "tenants.slug": `eq.${this.tenantSlug}`,
      "tenants.status": "eq.active",
      active: "is.true",
      limit: "2",
    });
    const { rows } = await this.fetchRows<SupplierRow>("suppliers", search);
    if (rows.length !== 1 || !rows[0]?.id || !rows[0].active) {
      providerError("Runia no tiene un proveedor VINROS activo y unívoco.");
    }
    return rows[0];
  }

  private getSupplier() {
    this.supplierPromise ??= this.loadSupplier().catch((error: unknown) => {
      this.supplierPromise = null;
      throw error;
    });
    return this.supplierPromise;
  }

  private productSearch(
    supplierId: string,
    pricingContext: CustomerPricingContext,
  ) {
    return new URLSearchParams({
      select:
        "runia_product_id:id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices!inner(price_type,current_price)",
      supplier_id: `eq.${supplierId}`,
      eligibility_status: "eq.safe",
      active: "is.true",
      "retail_prices.price_type": `eq.${pricingContext.basePriceType}`,
    });
  }

  private publicImageUrl(media: RuniaPublicMediaRow) {
    const path = media.storage_path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.url}/storage/v1/object/public/${encodeURIComponent(media.bucket_id)}/${path}`;
  }

  private async loadImages(productIds: string[]) {
    const ids = Array.from(new Set(productIds)).filter((id) => UUID_PATTERN.test(id));
    if (!ids.length) return { images: new Map(), queryTimeMs: 0 };
    const search = new URLSearchParams({
      select:
        "id,supplier_product_id,bucket_id,storage_path,alt_text,width,height,position,is_primary",
      supplier_product_id: `in.(${ids.join(",")})`,
      order: "is_primary.desc,position.asc,id.asc",
      limit: String(Math.min(ids.length * 20, 2000)),
    });
    const { rows, queryTimeMs } = await this.fetchRows<RuniaPublicMediaRow>(
      "supplier_product_public_media",
      search,
    );
    const images = new Map<string, ProductImage[]>();
    for (const media of rows) {
      const productImages = images.get(media.supplier_product_id) ?? [];
      productImages.push({
        id: media.id,
        src: this.publicImageUrl(media),
        alt: media.alt_text,
        width: media.width ?? undefined,
        height: media.height ?? undefined,
        position: media.position,
      });
      images.set(media.supplier_product_id, productImages);
    }
    return { images, queryTimeMs };
  }

  private async mapRows(
    rows: RuniaSupplierProductRow[],
    pricingContext: CustomerPricingContext,
  ) {
    try {
      const media = await this.loadImages(rows.map((row) => row.runia_product_id));
      return {
        products: rows.map((row) =>
          mapRuniaSupplierProduct(
            row,
            pricingContext,
            media.images.get(row.runia_product_id) ?? [],
          ),
        ),
        imageQueryTimeMs: media.queryTimeMs,
      };
    } catch {
      providerError("Runia devolvió un producto SAFE con datos inválidos.");
    }
  }

  async getProductPage(
    query: ProductPageQuery = {},
    pricingContext = this.defaultPricingContext,
  ) {
    const supplier = await this.getSupplier();
    const offset = clampInteger(query.offset, 0, 100_000);
    const limit = clampInteger(
      query.limit,
      CATALOG_PAGE_SIZE,
      CATALOG_MAX_PAGE_SIZE,
    ) || CATALOG_PAGE_SIZE;
    const search = this.productSearch(supplier.id, pricingContext);
    search.set("order", "normalized_name.asc,id.asc");
    search.set("offset", String(offset));
    search.set("limit", String(limit));

    const term = sanitizedSearch(query.search);
    if (term) {
      search.set(
        "or",
        `(normalized_name.ilike.*${term}*,supplier_sku.ilike.*${term}*)`,
      );
    }

    const categoryFilter = query.categorySlug
      ? categoryFilterForPostgrest(query.categorySlug)
      : null;
    if (categoryFilter) {
      if (search.has(categoryFilter.key)) {
        search.append(categoryFilter.key, categoryFilter.value);
      } else {
        search.set(categoryFilter.key, categoryFilter.value);
      }
    }

    const { rows, response, queryTimeMs } =
      await this.fetchRows<RuniaSupplierProductRow>(
        "supplier_products",
        search,
        true,
      );
    const mapped = await this.mapRows(rows, pricingContext);
    const products = mapped.products;
    const total = contentRangeTotal(response, offset + products.length);

    return {
      products,
      total,
      offset,
      limit,
      hasMore: offset + products.length < total,
      queryTimeMs: Math.round((queryTimeMs + mapped.imageQueryTimeMs) * 10) / 10,
    };
  }

  async getProductsByIds(
    productIds: string[],
    pricingContext = this.defaultPricingContext,
  ) {
    const ids = Array.from(new Set(productIds)).filter((id) => UUID_PATTERN.test(id));
    if (!ids.length) return [];

    const supplier = await this.getSupplier();
    const search = this.productSearch(supplier.id, pricingContext);
    search.set("id", `in.(${ids.slice(0, 99).join(",")})`);
    search.set("order", "normalized_name.asc,id.asc");
    search.set("limit", "99");
    const { rows } = await this.fetchRows<RuniaSupplierProductRow>(
      "supplier_products",
      search,
    );
    return (await this.mapRows(rows, pricingContext)).products;
  }

  async getProductBySlug(
    slug: string,
    pricingContext = this.defaultPricingContext,
  ) {
    const productId = runiaProductIdFromProductSlug(slug);
    if (!productId) return null;

    const supplier = await this.getSupplier();
    const search = this.productSearch(supplier.id, pricingContext);
    search.set("id", `eq.${productId}`);
    search.set("limit", "2");
    const { rows } = await this.fetchRows<RuniaSupplierProductRow>(
      "supplier_products",
      search,
    );
    if (!rows.length) return null;
    if (rows.length !== 1) {
      providerError("Runia devolvió más de un producto para el mismo ID.");
    }

    return (await this.mapRows(rows, pricingContext)).products[0] ?? null;
  }

  async getCategories(): Promise<Category[]> {
    return [...RUNIA_CATALOG_CATEGORIES];
  }
}
