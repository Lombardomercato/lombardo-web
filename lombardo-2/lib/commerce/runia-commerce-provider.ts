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
  fetchSupabaseRest,
  supabaseRestResponseError,
} from "../server/supabase-rest.ts";
import {
  categoryFilterForPostgrest,
  categoryForSupplierSku,
  categorySearchScope,
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

interface SearchProductIdRow {
  product_id: string;
  search_rank: number | string;
  total_count: number | string;
}

function providerError(message: string, cause?: unknown): never {
  throw new ServerOrderError("SERVER_NOT_CONFIGURED", message, {
    status: 503,
    cause,
  });
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
    const operation = `Runia REST GET ${table}`;
    let response: Response;
    try {
      response = await fetchSupabaseRest(
        `${this.url}/rest/v1/${table}?${search.toString()}`,
        { headers: this.headers(preferCount), cache: "no-store" },
        { fetcher: this.fetcher, operation },
      );
    } catch (error) {
      providerError("Runia no pudo conectar con el catálogo real de VINROS.", error);
    }
    const queryTimeMs = performance.now() - startedAt;
    if (!response.ok) {
      providerError(
        "Runia no pudo entregar el catálogo real de VINROS.",
        await supabaseRestResponseError(response, operation),
      );
    }
    return {
      rows: (await response.json()) as T[],
      response,
      queryTimeMs,
    };
  }

  private async fetchRpcRows<T>(
    functionName: string,
    body: Record<string, unknown>,
  ) {
    const startedAt = performance.now();
    const response = await this.fetcher(
      `${this.url}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          ...this.headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const queryTimeMs = performance.now() - startedAt;
    if (!response.ok) {
      providerError("Runia no pudo buscar productos en el catálogo real.");
    }
    return {
      rows: (await response.json()) as T[],
      queryTimeMs,
    };
  }

  private async searchProductIds(input: {
    supplierId: string;
    query: string;
    offset: number;
    limit: number;
    pricingContext: CustomerPricingContext;
    categorySlug?: string;
    requireImage?: boolean;
    prioritizeImages?: boolean;
  }) {
    const category = categorySearchScope(input.categorySlug);
    return this.fetchRpcRows<SearchProductIdRow>(
      "supplier_search_product_ids",
      {
        p_supplier_id: input.supplierId,
        p_query: input.query,
        p_offset: input.offset,
        p_limit: input.limit,
        p_eligibility: "safe",
        p_active_only: true,
        p_price_type: input.pricingContext.basePriceType,
        p_require_image: Boolean(input.requireImage),
        p_prioritize_images: Boolean(input.prioritizeImages),
        p_category_prefixes: category.prefixes ?? null,
        p_excluded_category_prefixes: category.excludedPrefixes ?? null,
      },
    );
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
    let media: Awaited<ReturnType<RuniaCommerceProvider["loadImages"]>>;
    try {
      media = await this.loadImages(rows.map((row) => row.runia_product_id));
    } catch (error) {
      providerError("Runia no pudo cargar las imágenes públicas del catálogo.", error);
    }

    try {
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
    } catch (error) {
      providerError("Runia devolvió un producto SAFE con datos inválidos.", error);
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
    let fuzzyQueryTimeMs = 0;
    let fuzzyTotal: number | undefined;
    let rankedIds: string[] | undefined;

    if (query.requireImage) {
      search.set("has_public_media", "is.true");
    }

    const term = sanitizedSearch(query.search);
    if (term) {
      const fuzzyResult = await this.searchProductIds({
        supplierId: supplier.id,
        query: term,
        offset,
        limit,
        pricingContext,
        categorySlug: query.categorySlug,
        requireImage: query.requireImage,
        prioritizeImages: true,
      });
      fuzzyQueryTimeMs = fuzzyResult.queryTimeMs;
      fuzzyTotal = Number(fuzzyResult.rows[0]?.total_count ?? 0);
      rankedIds = fuzzyResult.rows.map((row) => row.product_id);
      if (!rankedIds.length) {
        return {
          products: [],
          total: 0,
          offset,
          limit,
          hasMore: false,
          queryTimeMs: Math.round(fuzzyQueryTimeMs * 10) / 10,
        };
      }
      search.set("id", `in.(${rankedIds.join(",")})`);
      search.set("limit", String(rankedIds.length));
    } else {
      search.set("offset", String(offset));
      search.set("limit", String(limit));
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
    const rankById = new Map(
      (rankedIds ?? []).map((id, index) => [id, index]),
    );
    const products = rankedIds
      ? mapped.products.sort(
          (left, right) =>
            (rankById.get(left.sourceProductId ?? "") ?? Number.MAX_SAFE_INTEGER) -
            (rankById.get(right.sourceProductId ?? "") ?? Number.MAX_SAFE_INTEGER),
        )
      : mapped.products;
    const total = fuzzyTotal ?? contentRangeTotal(response, offset + products.length);

    return {
      products,
      total,
      offset,
      limit,
      hasMore: offset + products.length < total,
      queryTimeMs:
        Math.round(
          (fuzzyQueryTimeMs + queryTimeMs + mapped.imageQueryTimeMs) * 10,
        ) / 10,
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
    const fuzzyResult = await this.searchProductIds({
      supplierId: supplier.id,
      query: term,
      offset: 0,
      limit: candidateLimit,
      pricingContext,
    });
    const ids = fuzzyResult.rows.map((row) => row.product_id);
    if (!ids.length) {
      return {
        products: [],
        queryTimeMs: Math.round(fuzzyResult.queryTimeMs * 10) / 10,
        truncated: false,
      };
    }
    const productSearch = this.quickOrderProductSearch(
      supplier.id,
      pricingContext,
    );
    productSearch.set("id", `in.(${ids.join(",")})`);
    productSearch.set("limit", String(ids.length));
    const productResult = await this.fetchRows<QuickOrderSupplierProductRow>(
      "supplier_products",
      productSearch,
    );
    const rowsById = new Map(
      productResult.rows.map((row) => [row.runia_product_id, row]),
    );

    let products: QuickOrderProduct[];
    try {
      products = ids.flatMap((id) => {
        const row = rowsById.get(id);
        return row
          ? [{
              product: mapRuniaSupplierProduct(row, pricingContext),
              publicUnitPrice: quickOrderPublicPrice(row),
            }]
          : [];
      });
    } catch {
      providerError("Runia devolvió un producto SAFE con datos inválidos.");
    }

    return {
      products: products.slice(0, limit),
      queryTimeMs:
        Math.round(
          (fuzzyResult.queryTimeMs + productResult.queryTimeMs) * 10,
        ) / 10,
      truncated:
        Number(fuzzyResult.rows[0]?.total_count ?? products.length) > limit,
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
