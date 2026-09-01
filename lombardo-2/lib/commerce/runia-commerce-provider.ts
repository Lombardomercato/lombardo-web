import type { Category, ProductImage } from "../../types/commerce.ts";
import type {
  QuickOrderProduct,
  QuickOrderProvider,
  QuickOrderSearchInput,
} from "../quick-order/types.ts";
import {
  QUICK_ORDER_MAX_SEARCH_LIMIT,
  QUICK_ORDER_SEARCH_LIMIT,
} from "../quick-order/types.ts";
import {
  retailPricingContext,
  type CustomerPricingContext,
} from "../server/customers/types.ts";
import type { ServerProductSource } from "../server/orders/order-dependencies.ts";
import { ServerOrderError } from "../server/orders/server-order-error.ts";
import {
  categoryFilterForPostgrest,
  categoryForSupplierSku,
  mapRuniaSupplierProduct,
  runiaProductIdFromProductSlug,
  RUNIA_CATALOG_CATEGORIES,
  slugify,
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

interface IndexableProductRow {
  runia_product_id: string;
  supplier_sku: string;
  name_raw: string;
}

interface QuickOrderSupplierProductRow extends RuniaSupplierProductRow {
  public_prices:
    | Array<{ price_type: string; current_price: number | string }>
    | { price_type: string; current_price: number | string }
    | null;
}

interface QuickOrderBrandRow {
  supplier_product_id: string;
  brand_name: string | null;
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

function relationRows<T>(value: T | T[] | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  return value ? [value] : [];
}

function quickOrderPublicPrice(row: QuickOrderSupplierProductRow) {
  const lombardoRetail = relationRows(row.lombardo_prices).find(
    (price) => price.price_type === "retail" && price.active,
  );
  const retail = relationRows(row.public_prices).find(
    (price) => price.price_type === "retail",
  );
  const price = Number(lombardoRetail?.current_price ?? retail?.current_price);
  return Number.isFinite(price) && price > 0 ? price : undefined;
}

function quickOrderRank(product: QuickOrderProduct, term: string) {
  const normalizedSku = product.product.sku.toLocaleLowerCase("es-AR");
  const normalizedName = product.product.name.toLocaleLowerCase("es-AR");
  const normalizedBrand = product.product.brand.name.toLocaleLowerCase("es-AR");
  if (normalizedSku === term) return 0;
  if (normalizedSku.startsWith(term)) return 1;
  if (normalizedName.startsWith(term)) return 2;
  if (normalizedBrand.startsWith(term)) return 3;
  if (normalizedName.includes(term)) return 4;
  if (normalizedBrand.includes(term)) return 5;
  return 6;
}

function contentRangeTotal(response: Response, fallback: number) {
  const total = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  return total ? Number(total) : fallback;
}

export class RuniaCommerceProvider
  implements CommerceProvider, ServerProductSource, QuickOrderProvider
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
    requireOpportunity = false,
  ) {
    return new URLSearchParams({
      select:
        `runia_product_id:id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices!inner(price_type,current_price),lombardo_prices:lombardo_selling_prices(id,price_type,current_price,version,active),opportunities:lombardo_product_opportunities${requireOpportunity ? "!inner" : ""}(selling_price_id,reference_price,opportunity,opportunity_start,opportunity_review_at),editorial:supplier_product_editorial(brand_name)`,
      supplier_id: `eq.${supplierId}`,
      eligibility_status: "eq.safe",
      active: "is.true",
      "retail_prices.price_type": `eq.${pricingContext.basePriceType}`,
      "lombardo_prices.price_type": "eq.retail",
      "lombardo_prices.active": "is.true",
      ...(requireOpportunity ? {
        "opportunities.opportunity": "is.true",
        "opportunities.opportunity_start": `lte.${new Date().toISOString()}`,
        "opportunities.opportunity_review_at": `gt.${new Date().toISOString()}`,
      } : {}),
    });
  }

  private quickOrderProductSearch(
    supplierId: string,
    pricingContext: CustomerPricingContext,
  ) {
    return new URLSearchParams({
      select:
        "runia_product_id:id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices!inner(price_type,current_price),public_prices:supplier_prices(price_type,current_price),lombardo_prices:lombardo_selling_prices(id,price_type,current_price,version,active),opportunities:lombardo_product_opportunities(selling_price_id,reference_price,opportunity,opportunity_start,opportunity_review_at),editorial:supplier_product_editorial(brand_name)",
      supplier_id: `eq.${supplierId}`,
      eligibility_status: "eq.safe",
      active: "is.true",
      "retail_prices.price_type": `eq.${pricingContext.basePriceType}`,
      "public_prices.price_type": "eq.retail",
      "lombardo_prices.price_type": "eq.retail",
      "lombardo_prices.active": "is.true",
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
    search.set("order", "has_public_media.desc,normalized_name.asc,id.asc");
    search.set("offset", String(offset));
    search.set("limit", String(limit));

    if (query.requireImage) {
      search.set("has_public_media", "is.true");
    }

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

  async searchProducts(
    input: QuickOrderSearchInput,
    pricingContext = this.defaultPricingContext,
  ) {
    const term = sanitizedSearch(input.search);
    if (!term) {
      return { products: [], queryTimeMs: 0, truncated: false };
    }

    const supplier = await this.getSupplier();
    const limit = clampInteger(
      input.limit,
      QUICK_ORDER_SEARCH_LIMIT,
      QUICK_ORDER_MAX_SEARCH_LIMIT,
    ) || QUICK_ORDER_SEARCH_LIMIT;
    const candidateLimit = Math.min(limit * 2, 60);
    const productSearch = this.quickOrderProductSearch(
      supplier.id,
      pricingContext,
    );
    productSearch.set(
      "or",
      `(normalized_name.ilike.*${term}*,supplier_sku.ilike.*${term}*)`,
    );
    productSearch.set("order", "normalized_name.asc,id.asc");
    productSearch.set("limit", String(candidateLimit));

    const brandSearch = new URLSearchParams({
      select:
        "supplier_product_id,brand_name,product:supplier_product_id!inner(supplier_id,active,eligibility_status)",
      brand_name: `ilike.*${term}*`,
      "product.supplier_id": `eq.${supplier.id}`,
      "product.active": "is.true",
      "product.eligibility_status": "eq.safe",
      order: "brand_name.asc,supplier_product_id.asc",
      limit: String(candidateLimit),
    });

    const [primaryResult, brandResult] = await Promise.all([
      this.fetchRows<QuickOrderSupplierProductRow>(
        "supplier_products",
        productSearch,
      ),
      this.fetchRows<QuickOrderBrandRow>(
        "supplier_product_editorial",
        brandSearch,
      ),
    ]);

    const knownIds = new Set(
      primaryResult.rows.map((row) => row.runia_product_id),
    );
    const brandIds = Array.from(
      new Set(
        brandResult.rows
          .map((row) => row.supplier_product_id)
          .filter((id) => UUID_PATTERN.test(id) && !knownIds.has(id)),
      ),
    ).slice(0, candidateLimit);

    let brandProductRows: QuickOrderSupplierProductRow[] = [];
    let brandProductQueryTimeMs = 0;
    if (brandIds.length) {
      const relatedSearch = this.quickOrderProductSearch(
        supplier.id,
        pricingContext,
      );
      relatedSearch.set("id", `in.(${brandIds.join(",")})`);
      relatedSearch.set("order", "normalized_name.asc,id.asc");
      relatedSearch.set("limit", String(candidateLimit));
      const relatedResult = await this.fetchRows<QuickOrderSupplierProductRow>(
        "supplier_products",
        relatedSearch,
      );
      brandProductRows = relatedResult.rows;
      brandProductQueryTimeMs = relatedResult.queryTimeMs;
    }

    const rowsById = new Map<string, QuickOrderSupplierProductRow>();
    for (const row of [...primaryResult.rows, ...brandProductRows]) {
      rowsById.set(row.runia_product_id, row);
    }

    let products: QuickOrderProduct[];
    try {
      products = Array.from(rowsById.values()).map((row) => ({
        product: mapRuniaSupplierProduct(row, pricingContext),
        publicUnitPrice: quickOrderPublicPrice(row),
      }));
    } catch {
      providerError("Runia devolvió un producto SAFE con datos inválidos.");
    }

    products.sort((left, right) => {
      const rank = quickOrderRank(left, term) - quickOrderRank(right, term);
      return (
        rank ||
        left.product.name.localeCompare(right.product.name, "es-AR", {
          sensitivity: "base",
        }) ||
        left.product.sku.localeCompare(right.product.sku, "es-AR")
      );
    });

    return {
      products: products.slice(0, limit),
      queryTimeMs:
        Math.round(
          (primaryResult.queryTimeMs +
            brandResult.queryTimeMs +
            brandProductQueryTimeMs) *
            10,
        ) / 10,
      truncated:
        products.length > limit ||
        primaryResult.rows.length === candidateLimit ||
        brandResult.rows.length === candidateLimit,
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

  async getActiveOpportunities(
    limit = 48,
    pricingContext = this.defaultPricingContext,
  ) {
    if (pricingContext.basePriceType !== "retail") return [];
    const supplier = await this.getSupplier();
    const search = this.productSearch(supplier.id, pricingContext, true);
    search.set("order", "normalized_name.asc,id.asc");
    search.set("limit", String(Math.min(Math.max(Math.trunc(limit), 1), 100)));
    const { rows } = await this.fetchRows<RuniaSupplierProductRow>(
      "supplier_products",
      search,
    );
    const mapped = await this.mapRows(rows, pricingContext);
    return mapped.products.filter((product) => product.opportunity && product.images.length);
  }

  async getIndexableProducts() {
    const supplier = await this.getSupplier();
    const pageSize = 1000;
    const products: Array<{ slug: string; categorySlug: string }> = [];

    for (let offset = 0; ; offset += pageSize) {
      const search = new URLSearchParams({
        select:
          "runia_product_id:id,supplier_sku,name_raw,retail_prices:supplier_prices!inner(price_type)",
        supplier_id: `eq.${supplier.id}`,
        eligibility_status: "eq.safe",
        active: "is.true",
        "retail_prices.price_type": "eq.retail",
        order: "normalized_name.asc,id.asc",
        offset: String(offset),
        limit: String(pageSize),
      });
      const { rows } = await this.fetchRows<IndexableProductRow>(
        "supplier_products",
        search,
      );

      products.push(
        ...rows.map((row) => ({
          slug: `${slugify(row.name_raw)}--${row.runia_product_id}`,
          categorySlug: categoryForSupplierSku(row.supplier_sku).slug,
        })),
      );

      if (rows.length < pageSize) break;
    }

    return products;
  }

  async getCategories(): Promise<Category[]> {
    return [...RUNIA_CATALOG_CATEGORIES];
  }
}
