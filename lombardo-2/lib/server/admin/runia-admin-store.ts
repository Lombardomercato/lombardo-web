import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import {
  categoryFilterForPostgrest,
  categoryForSupplierSku,
  inferBrand,
} from "../../commerce/runia-catalog-mapper";
import type {
  CheckoutCustomer,
  DeliveryAddress,
  DeliveryMethod,
  OrderCurrency,
  OrderItemSnapshot,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "../../../types/checkout";
import type {
  AdminCustomer,
  AdminCustomerDetail,
  AdminCustomerInput,
  AdminDashboard,
  AdminImageCandidate,
  AdminImageCandidatePage,
  ImageQualityStatus,
  AdminUnmatchedImageProductPage,
  MatchConfidenceBand,
  AdminOrder,
  AdminOrderFilters,
  AdminOrderManagementInput,
  AdminProduct,
  AdminProductDetail,
  AdminProductEditorial,
  AdminProductImageRender,
  AdminProductMedia,
  AdminProductPrice,
  AdminProductPage,
  AdminPromotion,
  AdminPromotionInput,
  AdminSession,
  FulfillmentStatus,
  FulfillmentTransitionResult,
  SupplierPriceType,
  VinrosHealth,
  VinrosReviewProduct,
  MatchReviewStatus,
} from "./types";
import type {
  OrderNotification,
  OrderNotificationStatus,
} from "../notifications/types";
import type { CustomerPricingContext } from "../customers/types";

interface RuniaAdminStoreOptions {
  url: string;
  secretKey: string;
  tenantId: string;
  fetcher?: typeof fetch;
}

interface AdminOperatorRow {
  id: string;
  auth_user_id: string;
  tenant_id: string;
  display_name: string;
  role: "admin" | "operator";
  active: boolean;
}

interface AdminSessionRow {
  expires_at: string;
  operator: AdminOperatorRow | AdminOperatorRow[] | null;
}

interface OrderRow {
  id: string | number;
  public_id: string;
  customer_account_id: string | null;
  customer: CheckoutCustomer;
  items: OrderItemSnapshot[];
  subtotal: number | string;
  base_subtotal?: number | string;
  pricing_discount_amount?: number | string;
  commercial_subtotal?: number | string;
  coupon_code?: string | null;
  coupon_discount_amount?: number | string;
  delivery_cost: number | string;
  total: number | string;
  order_source?: "storefront" | "admin_manual";
  management_customer?: CheckoutCustomer | null;
  management_items?: OrderItemSnapshot[] | null;
  management_delivery_method?: DeliveryMethod | null;
  management_delivery_address?: DeliveryAddress | null;
  management_items_subtotal?: number | string | null;
  management_discount_amount?: number | string | null;
  management_discount_reason?: string | null;
  management_subtotal?: number | string | null;
  management_delivery_cost?: number | string | null;
  management_total?: number | string | null;
  management_notes?: string | null;
  management_revision?: number | null;
  management_updated_at?: string | null;
  currency: OrderCurrency;
  delivery_method: DeliveryMethod;
  delivery_address: DeliveryAddress | null;
  order_status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method: PaymentMethod;
  payment_provider_id: string | null;
  payment_preference_id: string | null;
  fulfillment_status: FulfillmentStatus | null;
  fulfillment_updated_at: string | null;
  confirmed_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

interface CustomerAccountRow {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  whatsapp_phone: string | null;
  account_type: AdminCustomer["accountType"];
  pricing_policy: AdminCustomer["pricingPolicy"];
  discount_percent: number | string;
  status: AdminCustomer["status"];
  created_at: string;
  updated_at: string;
}

interface PromotionRow {
  id: string;
  code: string;
  name: string;
  description: string;
  status: AdminPromotion["status"];
  discount_type: AdminPromotion["discountType"];
  discount_value: number | string;
  start_at: string | null;
  end_at: string | null;
  minimum_order_amount: number | string;
  max_total_uses: number | null;
  max_uses_per_customer: number | null;
  applies_to: AdminPromotion["appliesTo"];
  customer_scope: AdminPromotion["customerScope"];
  stackable: boolean;
  first_order_only: boolean;
  created_at: string;
  updated_at: string;
}

interface ProductRow {
  id: string;
  supplier_sku: string;
  name_raw: string;
  presentation_raw: string | null;
  normalized_presentation: string | null;
  active: boolean;
  eligibility_status: AdminProduct["eligibilityStatus"];
  source_raw?: unknown;
  last_seen_at?: string;
  retail_prices:
    | Array<{ price_type: string; current_price: number | string }>
    | { price_type: string; current_price: number | string }
    | null;
  editorial?: ProductEditorialRow | ProductEditorialRow[] | null;
  media?: ProductMediaRow[] | ProductMediaRow | null;
  all_prices?: ProductPriceRow[] | ProductPriceRow | null;
  anomalies?: ProductAnomalyRow[] | ProductAnomalyRow | null;
}

interface ProductPriceRow {
  price_type: SupplierPriceType;
  current_price: number | string;
}

interface ProductEditorialRow {
  name_override: string | null;
  brand_name: string | null;
  category_slug: string | null;
  description: string | null;
  tags: string[] | null;
  internal_notes: string | null;
  editorial_status: "draft" | "approved";
}

interface ProductMediaRow {
  id: string;
  bucket_id: string;
  storage_path: string;
  mime_type: string;
  byte_size: number;
  alt_text: string;
  position: number;
  is_primary: boolean;
  source: AdminProductMedia["source"];
  source_url: string | null;
  approval_status: string;
  rights_status: string;
}

interface ProductAnomalyRow {
  id: string;
  anomaly_type: string;
  severity: string;
  status: string;
  price_type: string | null;
  observed_price: number | string | null;
  message: string;
  last_detected_at: string;
}

interface ProductImageRenderRow {
  id: string;
  visual_variant: AdminProductImageRender["variant"];
  render_version: number;
  render_config: { scale?: unknown; pilotOrder?: unknown } | null;
  product: ProductRow | ProductRow[] | null;
  master: ProductMediaRow | ProductMediaRow[] | null;
}

interface NormalizableProductMediaRow extends ProductMediaRow {
  supplier_product_id: string;
  width: number | null;
  height: number | null;
  product:
    | { supplier_id: string; active: boolean; eligibility_status: string }
    | Array<{ supplier_id: string; active: boolean; eligibility_status: string }>
    | null;
}

export interface NormalizableProductMedia {
  id: string;
  productId: string;
  sourceUrl: string;
  altText: string;
}

interface PublishableImageCandidateRow {
  id: string;
  supplier_product_id: string;
  source_url: string;
  image_url: string;
  match_review_status: MatchReviewStatus;
  approval_status: "pending" | "approved" | "rejected";
  product:
    | { supplier_id: string; supplier_sku: string; name_raw: string; active: boolean; eligibility_status: string }
    | Array<{ supplier_id: string; supplier_sku: string; name_raw: string; active: boolean; eligibility_status: string }>;
}

interface AutomationRunRow {
  started_at: string;
  finished_at: string | null;
  status: string;
  products: number;
  prices_changed: number;
  blocked: number;
  pending_review: number;
  supplier_only_cost: number;
  errors: number;
  error_summary: string | null;
  alert_status: string;
  alert_error_summary: string | null;
  dry_run_result: { policyCanWrite?: boolean; blockingReasons?: string[] } | null;
  write_result: { pricesUpdated?: number; pricesUnchanged?: number } | null;
}

interface SyncRunRow {
  started_at: string;
  finished_at: string | null;
  status: string;
  prices_updated: number;
}

interface ImageCandidateRow {
  id: string;
  external_product_match_id: string | null;
  source: string;
  source_url: string;
  image_url: string;
  match_confidence: number | string;
  match_review_status: MatchReviewStatus;
  approval_status: "pending" | "approved" | "rejected";
  rights_status: "unknown" | "licensed" | "approved" | "restricted";
  quality_status: ImageQualityStatus;
  provenance: {
    externalProductName?: unknown;
    matchedFields?: unknown;
    mismatchWarnings?: unknown;
    hardConflicts?: unknown;
    externalPresentation?: unknown;
    approvalMode?: unknown;
    reviewRiskRank?: unknown;
    reviewRiskKind?: unknown;
    reviewRiskReason?: unknown;
    reviewPriorityScore?: unknown;
    reviewRiskVersion?: unknown;
  } | null;
  created_at: string;
  product: Pick<
    ProductRow,
    "id" | "supplier_sku" | "name_raw" | "presentation_raw" | "normalized_presentation"
  > | Array<Pick<
    ProductRow,
    "id" | "supplier_sku" | "name_raw" | "presentation_raw" | "normalized_presentation"
  >> | null;
}

interface SupplierRow {
  id: string;
}

interface TransitionRow {
  changed: boolean;
  order_record: OrderRow;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface NotificationRow {
  id: string | number;
  order_id: string | number;
  kind: OrderNotification["kind"];
  channel: OrderNotification["channel"];
  status: OrderNotificationStatus;
  attempt_count: number;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

function mapNotification(row: NotificationRow): OrderNotification {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    kind: row.kind,
    channel: row.channel,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    providerMessageId: row.provider_message_id ?? undefined,
    lastErrorCode: row.last_error_code ?? undefined,
    lastErrorSummary: row.last_error_summary ?? undefined,
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ORDER_SELECT = [
  "id",
  "public_id",
  "customer_account_id",
  "customer",
  "items",
  "subtotal",
  "base_subtotal",
  "pricing_discount_amount",
  "commercial_subtotal",
  "coupon_code",
  "coupon_discount_amount",
  "delivery_cost",
  "total",
  "order_source",
  "management_customer",
  "management_items",
  "management_delivery_method",
  "management_delivery_address",
  "management_items_subtotal",
  "management_discount_amount",
  "management_discount_reason",
  "management_subtotal",
  "management_delivery_cost",
  "management_total",
  "management_notes",
  "management_revision",
  "management_updated_at",
  "currency",
  "delivery_method",
  "delivery_address",
  "order_status",
  "payment_status",
  "payment_method",
  "payment_provider_id",
  "payment_preference_id",
  "fulfillment_status",
  "fulfillment_updated_at",
  "confirmed_at",
  "preparing_at",
  "ready_at",
  "delivered_at",
  "cancelled_at",
  "created_at",
  "updated_at",
].join(",");

function mapOrder(row: OrderRow): AdminOrder {
  const fulfillmentStatus =
    row.fulfillment_status ??
    (row.order_status === "cancelled"
      ? "cancelled"
      : row.order_status === "confirmed"
        ? "confirmed"
        : "new");
  const hasManagementOverride = Array.isArray(row.management_items);
  const managementDiscount = hasManagementOverride
    ? Number(row.management_discount_amount ?? 0)
    : 0;
  return {
    id: String(row.id),
    customerAccountId: row.customer_account_id ?? undefined,
    publicId: row.public_id,
    displayId: row.public_id.slice(0, 8).toUpperCase(),
    customer: row.management_customer ?? row.customer,
    items: row.management_items ?? row.items,
    subtotal: hasManagementOverride ? Number(row.management_subtotal) : Number(row.subtotal),
    baseSubtotal: hasManagementOverride
      ? Number(row.management_items_subtotal)
      : row.base_subtotal === undefined ? undefined : Number(row.base_subtotal),
    pricingDiscountAmount: hasManagementOverride
      ? undefined
      : row.pricing_discount_amount === undefined ? undefined : Number(row.pricing_discount_amount),
    commercialSubtotal: hasManagementOverride
      ? Number(row.management_items_subtotal)
      : row.commercial_subtotal === undefined ? undefined : Number(row.commercial_subtotal),
    couponCode: hasManagementOverride ? undefined : row.coupon_code ?? undefined,
    couponDiscountAmount: hasManagementOverride
      ? undefined
      : row.coupon_discount_amount === undefined ? undefined : Number(row.coupon_discount_amount),
    deliveryCost: hasManagementOverride ? Number(row.management_delivery_cost) : Number(row.delivery_cost),
    total: hasManagementOverride ? Number(row.management_total) : Number(row.total),
    commerceTotal: Number(row.total),
    currency: row.currency,
    deliveryMethod: row.management_delivery_method ?? row.delivery_method,
    deliveryAddress: (hasManagementOverride
      ? row.management_delivery_address
      : row.delivery_address) ?? undefined,
    orderStatus: row.order_status,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method,
    paymentProviderId: row.payment_provider_id ?? undefined,
    paymentPreferenceId: row.payment_preference_id ?? undefined,
    fulfillmentStatus,
    orderSource: row.order_source ?? "storefront",
    hasManagementOverride,
    manualDiscountAmount: managementDiscount > 0 ? managementDiscount : undefined,
    manualDiscountReason: row.management_discount_reason ?? undefined,
    managementNotes: row.management_notes ?? undefined,
    managementRevision: Number(row.management_revision ?? 0),
    managementUpdatedAt: row.management_updated_at ?? undefined,
    fulfillmentUpdatedAt: row.fulfillment_updated_at ?? row.created_at,
    confirmedAt: row.confirmed_at ?? undefined,
    preparingAt: row.preparing_at ?? undefined,
    readyAt: row.ready_at ?? undefined,
    deliveredAt: row.delivered_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeSearch(value: string | undefined) {
  return value
    ?.trim()
    .slice(0, 80)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9@.+\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchableOrder(order: AdminOrder) {
  return [
    order.publicId,
    order.displayId,
    order.customer.firstName,
    order.customer.lastName,
    order.customer.whatsapp,
    order.customer.email,
    ...order.items.flatMap((item) => [item.sku, item.name]),
  ]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR");
}

function argentinaDayKey(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function contentRangeTotal(response: Response, fallback: number) {
  const value = response.headers.get("content-range")?.match(/\/(\d+)$/)?.[1];
  return value ? Number(value) : fallback;
}

function asArray<T>(value: T | T[] | null | undefined): T[] {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function nextVinrosSync(from = new Date()) {
  const next = new Date(from);
  next.setUTCHours(6, 20, 0, 0);
  if (next <= from) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

function candidatePrices(sourceRaw: unknown) {
  if (!sourceRaw || typeof sourceRaw !== "object") return new Map<SupplierPriceType, number>();
  const candidates = (sourceRaw as { observedCandidates?: unknown }).observedCandidates;
  if (!candidates || typeof candidates !== "object") return new Map<SupplierPriceType, number>();
  const result = new Map<SupplierPriceType, number>();
  for (const type of ["retail", "wholesale", "business", "cost"] as const) {
    const value = (candidates as Record<string, unknown>)[type];
    const price = Number(value && typeof value === "object" ? (value as { price?: unknown }).price : NaN);
    if (Number.isFinite(price) && price > 0) result.set(type, price);
  }
  return result;
}

function privateAddress(address: string) {
  if (isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const normalized = address.toLocaleLowerCase("en-US");
  return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") ||
    normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("::ffff:127.") ||
    normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
}

async function assertPublicHttpsUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AdminStoreError("La imagen externa tiene una URL inválida.", 422);
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) {
    throw new AdminStoreError("La imagen externa debe usar HTTPS público.", 422);
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => privateAddress(address))) {
    throw new AdminStoreError("La fuente externa no resuelve a una dirección pública segura.", 422);
  }
  return url;
}

function validImageBytes(bytes: Uint8Array, mimeType: string) {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  const ascii = new TextDecoder("ascii").decode(bytes.slice(0, 16));
  if (mimeType === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  return mimeType === "image/avif" && (ascii.slice(4, 12) === "ftypavif" || ascii.slice(4, 12) === "ftypavis");
}

function htmlImageCandidate(html: string, baseUrl: URL) {
  let encoded = html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url)?["']/i)?.[1]
    || html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i)?.[1];
  if (!encoded) {
    for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        const queue: unknown[] = [JSON.parse(match[1])];
        while (queue.length) {
          const value = queue.shift();
          if (Array.isArray(value)) {
            queue.push(...value);
            continue;
          }
          if (!value || typeof value !== "object") continue;
          const record = value as Record<string, unknown>;
          const type = record["@type"];
          const product = type === "Product" || (Array.isArray(type) && type.includes("Product"));
          if (product) {
            const image = record.image;
            const first = Array.isArray(image) ? image[0] : image;
            if (typeof first === "string") encoded = first;
            else if (first && typeof first === "object") {
              const imageRecord = first as Record<string, unknown>;
              const url = imageRecord.url ?? imageRecord.contentUrl;
              if (typeof url === "string") encoded = url;
            }
            if (encoded) break;
          }
          queue.push(...Object.values(record));
        }
      } catch {
        // Keep reading other structured-data blocks from the approved source page.
      }
      if (encoded) break;
    }
  }
  if (!encoded) return null;
  const decoded = encoded
    .replaceAll("&amp;", "&")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"');
  try {
    return new URL(decoded, baseUrl).toString();
  } catch {
    return null;
  }
}

export class AdminStoreError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
  }
}

export class RuniaAdminStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantId: string;
  private readonly fetcher: typeof fetch;
  private supplierIdPromise: Promise<string> | null = null;
  private tenantRecordIdPromise: Promise<string> | null = null;

  constructor(options: RuniaAdminStoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantId = options.tenantId;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers(prefer?: string) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}, prefer?: string) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.headers(prefer), ...init.headers },
      cache: "no-store",
    });
  }

  private async rows<T>(path: string, fallback: string, prefer?: string) {
    const response = await this.request(path, {}, prefer);
    if (!response.ok) throw new AdminStoreError(fallback, 502);
    return { rows: (await response.json()) as T[], response };
  }

  private async tenantRecordId() {
    this.tenantRecordIdPromise ??= (async () => {
      const search = new URLSearchParams({
        select: "id",
        slug: `eq.${this.tenantId}`,
        status: "eq.active",
        limit: "2",
      });
      const { rows } = await this.rows<{ id: string }>(
        `tenants?${search}`,
        "No pudimos resolver el tenant de clientes.",
      );
      if (rows.length !== 1 || !UUID_PATTERN.test(rows[0].id)) {
        throw new AdminStoreError("El tenant de clientes no es válido.", 503);
      }
      return rows[0].id;
    })().catch((error: unknown) => {
      this.tenantRecordIdPromise = null;
      throw error;
    });
    return this.tenantRecordIdPromise;
  }

  async findOperatorByAuthUser(authUserId: string) {
    const search = new URLSearchParams({
      select: "id,auth_user_id,tenant_id,display_name,role,active",
      tenant_id: `eq.${this.tenantId}`,
      auth_user_id: `eq.${authUserId}`,
      active: "is.true",
      limit: "1",
    });
    const { rows } = await this.rows<AdminOperatorRow>(
      `lombardo_admin_operators?${search}`,
      "No pudimos validar el acceso del operador.",
    );
    return rows[0] ?? null;
  }

  async createSession(operatorId: string, tokenHash: string, expiresAt: Date) {
    const response = await this.request("lombardo_admin_sessions", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: this.tenantId,
        operator_id: operatorId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
      }),
    });
    if (!response.ok) {
      throw new AdminStoreError("No pudimos iniciar la sesión del Admin.", 502);
    }
  }

  async getSession(tokenHash: string): Promise<AdminSession | null> {
    const search = new URLSearchParams({
      select:
        "expires_at,operator:operator_id!inner(id,auth_user_id,tenant_id,display_name,role,active)",
      tenant_id: `eq.${this.tenantId}`,
      token_hash: `eq.${tokenHash}`,
      revoked_at: "is.null",
      expires_at: `gt.${new Date().toISOString()}`,
      "operator.active": "is.true",
      "operator.tenant_id": `eq.${this.tenantId}`,
      limit: "1",
    });
    const { rows } = await this.rows<AdminSessionRow>(
      `lombardo_admin_sessions?${search}`,
      "No pudimos validar la sesión del Admin.",
    );
    const row = rows[0];
    const operator = Array.isArray(row?.operator)
      ? row.operator[0]
      : row?.operator;
    if (!row || !operator?.active) return null;
    return {
      operatorId: operator.id,
      authUserId: operator.auth_user_id,
      tenantId: operator.tenant_id,
      displayName: operator.display_name,
      role: operator.role,
      expiresAt: row.expires_at,
    };
  }

  async revokeSession(tokenHash: string) {
    const search = new URLSearchParams({
      tenant_id: `eq.${this.tenantId}`,
      token_hash: `eq.${tokenHash}`,
      revoked_at: "is.null",
    });
    await this.request(`lombardo_admin_sessions?${search}`, {
      method: "PATCH",
      body: JSON.stringify({ revoked_at: new Date().toISOString() }),
    });
  }

  private orderSearch(filters: AdminOrderFilters, limit: number) {
    const search = new URLSearchParams({
      select: ORDER_SELECT,
      tenant_id: `eq.${this.tenantId}`,
      order: "created_at.desc",
      limit: String(limit),
    });
    if (filters.fulfillment) {
      search.set("fulfillment_status", `eq.${filters.fulfillment}`);
    }
    if (filters.payment) search.set("payment_status", `eq.${filters.payment}`);
    if (filters.delivery) search.set("delivery_method", `eq.${filters.delivery}`);
    if (filters.from) {
      search.append("created_at", `gte.${filters.from}T00:00:00-03:00`);
    }
    if (filters.to) {
      search.append("created_at", `lte.${filters.to}T23:59:59.999-03:00`);
    }
    return search;
  }

  async listOrders(filters: AdminOrderFilters = {}, limit = 250) {
    const { rows } = await this.rows<OrderRow>(
      `commerce_orders?${this.orderSearch(filters, limit)}`,
      "No pudimos cargar los pedidos.",
    );
    const orders = rows.map(mapOrder);
    const term = safeSearch(filters.search);
    return term
      ? orders.filter((order) => searchableOrder(order).includes(term))
      : orders;
  }

  async getOrder(publicId: string) {
    const search = new URLSearchParams({
      select: ORDER_SELECT,
      tenant_id: `eq.${this.tenantId}`,
      public_id: `eq.${publicId}`,
      limit: "1",
    });
    const { rows } = await this.rows<OrderRow>(
      `commerce_orders?${search}`,
      "No pudimos cargar el pedido.",
    );
    if (!rows[0]) return null;
    const order = mapOrder(rows[0]);
    const notificationSearch = new URLSearchParams({
      select:
        "id,order_id,kind,channel,status,attempt_count,provider_message_id,last_error_code,last_error_summary,sent_at,created_at,updated_at",
      tenant_id: `eq.${this.tenantId}`,
      order_id: `eq.${order.id}`,
      kind: "in.(new_order,customer_order_confirmation)",
      order: "created_at.desc",
      limit: "2",
    });
    const notificationResult = await this.rows<NotificationRow>(
      `commerce_order_notifications?${notificationSearch}`,
      "No pudimos cargar el estado de la notificación.",
    );
    const newOrderNotification = notificationResult.rows.find(
      (notification) => notification.kind === "new_order",
    );
    const customerOrderConfirmation = notificationResult.rows.find(
      (notification) => notification.kind === "customer_order_confirmation",
    );
    return {
      ...order,
      newOrderNotification: newOrderNotification
        ? mapNotification(newOrderNotification)
        : undefined,
      customerOrderConfirmation: customerOrderConfirmation
        ? mapNotification(customerOrderConfirmation)
        : undefined,
    };
  }

  async searchOrderProducts(searchTerm: string): Promise<AdminProduct[]> {
    const search = safeSearch(searchTerm);
    if (!search) return [];
    const page = await this.listProducts({
      search,
      eligibility: "safe",
      limit: 30,
    });
    return page.products.filter(
      (product) => product.active && product.retailPrice !== null,
    );
  }

  async getOrderProductsByIds(productIds: string[]): Promise<AdminProduct[]> {
    const ids = [...new Set(productIds)].filter((id) => UUID_PATTERN.test(id)).slice(0, 50);
    if (!ids.length) return [];
    const supplierId = await this.supplierId();
    const search = new URLSearchParams({
      select:
        "id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices(price_type,current_price),editorial:supplier_product_editorial(name_override,brand_name,category_slug,description,tags,internal_notes,editorial_status),media:supplier_product_media(id,bucket_id,storage_path,mime_type,byte_size,alt_text,position,is_primary,source,source_url,approval_status,rights_status)",
      supplier_id: `eq.${supplierId}`,
      id: `in.(${ids.join(",")})`,
      active: "is.true",
      eligibility_status: "eq.safe",
      limit: String(ids.length),
    });
    const { rows } = await this.rows<ProductRow>(
      `supplier_products?${search}`,
      "No pudimos validar los productos del pedido.",
    );
    return rows.map((row) => this.mapProduct(row)).filter(
      (product) => product.retailPrice !== null,
    );
  }

  private async orderManagementRequest(
    name: "lombardo_admin_create_order" | "lombardo_admin_update_order_management",
    body: Record<string, unknown>,
  ) {
    const response = await this.request(`rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
      if (payload.code === "40001") {
        throw new AdminStoreError(
          "El pedido cambió en otra pantalla. Actualizá antes de volver a guardar.",
          409,
        );
      }
      if (payload.code === "42501") {
        throw new AdminStoreError("No tenés permisos para editar pedidos.", 403);
      }
      if (payload.code === "P0002") {
        throw new AdminStoreError("Pedido no encontrado.", 404);
      }
      if (payload.code === "23514" || payload.code === "22P02") {
        throw new AdminStoreError("Los datos o totales del pedido no son válidos.", 422);
      }
      throw new AdminStoreError("No pudimos guardar el pedido.", 502);
    }
    const rows = (await response.json()) as Array<{ order_record: OrderRow }>;
    if (!rows[0]?.order_record) {
      throw new AdminStoreError("Runia no devolvió el pedido guardado.", 502);
    }
    return mapOrder(rows[0].order_record);
  }

  async createManualOrder(
    input: AdminOrderManagementInput,
    operatorUserId: string,
  ) {
    return this.orderManagementRequest("lombardo_admin_create_order", {
      p_tenant_id: this.tenantId,
      p_order: input,
      p_operator_user_id: operatorUserId,
    });
  }

  async updateOrderManagement(
    orderId: string,
    expectedRevision: number,
    input: AdminOrderManagementInput,
    operatorUserId: string,
  ) {
    if (!/^\d{1,18}$/.test(orderId) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
      throw new AdminStoreError("El pedido no es válido.", 422);
    }
    return this.orderManagementRequest("lombardo_admin_update_order_management", {
      p_tenant_id: this.tenantId,
      // Keep bigint identifiers as strings so JavaScript never rounds them.
      p_order_id: orderId,
      p_expected_revision: expectedRevision,
      p_management: input,
      p_operator_user_id: operatorUserId,
    });
  }

  async getDashboard(): Promise<AdminDashboard> {
    const orders = await this.listOrders({}, 500);
    const today = argentinaDayKey(new Date());
    const todayOrders = orders.filter((order) => argentinaDayKey(order.createdAt) === today);
    return {
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders
        .filter((order) => order.fulfillmentStatus !== "cancelled")
        .reduce((sum, order) => sum + order.total, 0),
      newOrders: orders.filter((order) => order.fulfillmentStatus === "new").length,
      preparingOrders: orders.filter(
        (order) => order.fulfillmentStatus === "preparing",
      ).length,
      readyOrders: orders.filter((order) => order.fulfillmentStatus === "ready").length,
      pendingPaymentOrders: orders.filter(
        (order) => order.paymentStatus === "pending",
      ).length,
      recentOrders: orders.slice(0, 8),
    };
  }

  async transitionFulfillment(
    orderId: string,
    expectedStatus: FulfillmentStatus,
    targetStatus: FulfillmentStatus,
    operatorUserId: string,
  ): Promise<FulfillmentTransitionResult> {
    if (!/^\d{1,18}$/.test(orderId)) {
      throw new AdminStoreError("El pedido no es válido.", 400);
    }
    const response = await this.request("rpc/lombardo_transition_fulfillment_status", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: this.tenantId,
        p_order_id: Number(orderId),
        p_expected_status: expectedStatus,
        p_target_status: targetStatus,
        p_operator_user_id: operatorUserId,
      }),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        message?: string;
      };
      if (payload.code === "40001") {
        throw new AdminStoreError(
          "El pedido cambió en otra pantalla. Actualizá y volvé a intentar.",
          409,
        );
      }
      if (payload.code === "22023") {
        throw new AdminStoreError(
          payload.message === "approved order requires refund workflow"
            ? "Un pedido aprobado requiere un flujo de devolución antes de cancelarse."
            : "Esa transición no está permitida.",
          422,
        );
      }
      throw new AdminStoreError("No pudimos actualizar el pedido.", 502);
    }
    const rows = (await response.json()) as TransitionRow[];
    if (!rows[0]?.order_record) {
      throw new AdminStoreError("Runia no devolvió el pedido actualizado.", 502);
    }
    return { changed: rows[0].changed, order: mapOrder(rows[0].order_record) };
  }

  private async supplierId() {
    this.supplierIdPromise ??= (async () => {
      const search = new URLSearchParams({
        select: "id,tenants:tenant_id!inner(slug,status)",
        code: "eq.vinros",
        "tenants.slug": `eq.${this.tenantId}`,
        "tenants.status": "eq.active",
        active: "is.true",
        limit: "1",
      });
      const { rows } = await this.rows<SupplierRow>(
        `suppliers?${search}`,
        "No pudimos resolver el catálogo de Lombardo.",
      );
      if (!rows[0]?.id) throw new AdminStoreError("Proveedor no disponible.", 502);
      return rows[0].id;
    })();
    return this.supplierIdPromise;
  }

  private mediaUrl(row: ProductMediaRow) {
    const path = row.storage_path
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `${this.url}/storage/v1/object/public/${encodeURIComponent(row.bucket_id)}/${path}`;
  }

  async listPrimaryProductMediaForNormalization(input: {
    cursor?: string;
    limit: number;
  }): Promise<NormalizableProductMedia[]> {
    const supplierId = await this.supplierId();
    const search = new URLSearchParams({
      select: "id,supplier_product_id,bucket_id,storage_path,mime_type,byte_size,width,height,alt_text,position,is_primary,source,source_url,approval_status,rights_status,product:supplier_product_id!inner(supplier_id,active,eligibility_status)",
      is_primary: "eq.true",
      approval_status: "eq.approved",
      rights_status: "in.(owned,licensed,approved)",
      "product.supplier_id": `eq.${supplierId}`,
      "product.active": "eq.true",
      "product.eligibility_status": "eq.safe",
      storage_path: "not.like.*/renders/product-image-system-v1/*",
      order: "id.asc",
      limit: String(Math.min(Math.max(input.limit, 1), 20)),
    });
    if (input.cursor && UUID_PATTERN.test(input.cursor)) search.set("id", `gt.${input.cursor}`);
    const { rows } = await this.rows<NormalizableProductMediaRow>(
      `supplier_product_media?${search}`,
      "No pudimos cargar las imágenes pendientes de normalización.",
    );
    return rows.map((row) => ({
      id: row.id,
      productId: row.supplier_product_id,
      sourceUrl: this.mediaUrl(row),
      altText: row.alt_text,
    }));
  }

  async uploadNormalizedProductRender(input: {
    sourceMediaId: string;
    productId: string;
    bytes: Uint8Array;
    contentSha256: string;
    backgroundConfidence: "high" | "medium" | "low";
    edgeCoverage: number;
    operatorUserId: string | null;
    jobId?: string;
  }) {
    if (!UUID_PATTERN.test(input.sourceMediaId) || !UUID_PATTERN.test(input.productId)) {
      throw new AdminStoreError("La imagen de origen no es válida.", 422);
    }
    const path = `${input.productId}/renders/product-image-system-v1/${input.sourceMediaId}.webp`;
    const storageHeaders: Record<string, string> = {
      apikey: this.secretKey,
      "Content-Type": "image/webp",
      "Cache-Control": "31536000, immutable",
      "x-upsert": "false",
    };
    if (!this.secretKey.startsWith("sb_secret_")) storageHeaders.Authorization = `Bearer ${this.secretKey}`;
    const upload = await this.fetcher(
      `${this.url}/storage/v1/object/product-media/${path}`,
      {
        method: "POST",
        headers: storageHeaders,
        body: Uint8Array.from(input.bytes).buffer,
        cache: "no-store",
      },
    );
    if (!upload.ok) throw new AdminStoreError("No pudimos subir el render normalizado.", 502);
    try {
      if (input.backgroundConfidence === "low" && (!input.jobId || !UUID_PATTERN.test(input.jobId))) {
        throw new AdminStoreError("El render de baja confianza requiere un trabajo autorizado.", 409);
      }
      await this.rpc(
        input.backgroundConfidence === "low"
          ? "supplier_publish_owner_directed_normalized_product_render"
          : "supplier_publish_normalized_product_render",
        {
        ...(input.backgroundConfidence === "low" ? { p_job_id: input.jobId } : {}),
        p_source_media_id: input.sourceMediaId,
        p_storage_path: path,
        p_byte_size: input.bytes.byteLength,
        p_content_sha256: input.contentSha256,
        p_background_confidence: input.backgroundConfidence,
        p_edge_coverage: input.edgeCoverage,
        p_created_by: input.operatorUserId,
      });
    } catch (error) {
      await this.deleteStorageObject("product-media", path).catch(() => undefined);
      throw error;
    }
  }

  private mapProduct(row: ProductRow): AdminProduct {
    const prices = asArray(row.retail_prices);
    const retail = Number(
      prices.find((price) => price.price_type === "retail")?.current_price,
    );
    const retailPrice = Number.isFinite(retail) && retail > 0 ? retail : null;
    const supplierCategory = categoryForSupplierSku(row.supplier_sku);
    const editorial = asArray(row.editorial)[0];
    const category = editorial?.category_slug
      ? { slug: editorial.category_slug, name: editorial.category_slug.replaceAll("-", " ") }
      : supplierCategory;
    const brand = editorial?.brand_name?.trim() || inferBrand(row.name_raw).name;
    const image = asArray(row.media)
      .filter((item) => item.approval_status === "approved")
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)[0];
    const published =
      row.active && row.eligibility_status === "safe" && retailPrice !== null;
    return {
      id: row.id,
      sku: row.supplier_sku,
      name: editorial?.name_override?.trim() || row.name_raw,
      presentation: row.normalized_presentation || row.presentation_raw || "Unidad",
      category: category.name.replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase("es-AR")),
      categorySlug: category.slug,
      brand,
      retailPrice,
      imageUrl: image ? this.mediaUrl(image) : undefined,
      active: row.active,
      eligibilityStatus: row.eligibility_status,
      publicationStatus: published ? "published" : "not_published",
    };
  }

  async listProducts(input: {
    offset?: number;
    limit?: number;
    search?: string;
    eligibility?: AdminProduct["eligibilityStatus"];
    category?: string;
  }): Promise<AdminProductPage> {
    const supplierId = await this.supplierId();
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(20, Math.trunc(input.limit ?? 50)));
    const search = new URLSearchParams({
      select:
        "id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices(price_type,current_price),editorial:supplier_product_editorial(name_override,brand_name,category_slug,description,tags,internal_notes,editorial_status),media:supplier_product_media(id,bucket_id,storage_path,mime_type,byte_size,alt_text,position,is_primary,source,source_url,approval_status,rights_status)",
      supplier_id: `eq.${supplierId}`,
      order: "normalized_name.asc,id.asc",
      offset: String(offset),
      limit: String(limit),
    });
    if (input.eligibility) {
      search.set("eligibility_status", `eq.${input.eligibility}`);
    }
    const categoryFilter = input.category
      ? categoryFilterForPostgrest(input.category)
      : null;
    if (categoryFilter) search.append(categoryFilter.key, categoryFilter.value);
    const term = safeSearch(input.search);
    if (term) {
      search.append(
        "or",
        `(normalized_name.ilike.*${term}*,supplier_sku.ilike.*${term}*)`,
      );
    }
    const { rows, response } = await this.rows<ProductRow>(
      `supplier_products?${search}`,
      "No pudimos cargar los productos.",
      "count=exact",
    );
    const products = rows.map((row) => this.mapProduct(row));
    const total = contentRangeTotal(response, offset + products.length);
    return {
      products,
      total,
      offset,
      limit,
      hasMore: offset + products.length < total,
    };
  }

  async getProduct(productId: string): Promise<AdminProductDetail | null> {
    if (!UUID_PATTERN.test(productId)) return null;
    const supplierId = await this.supplierId();
    const search = new URLSearchParams({
      select:
        "id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,source_raw,last_seen_at,retail_prices:supplier_prices(price_type,current_price),all_prices:supplier_prices(price_type,current_price),editorial:supplier_product_editorial(name_override,brand_name,category_slug,description,tags,internal_notes,editorial_status),media:supplier_product_media(id,bucket_id,storage_path,mime_type,byte_size,alt_text,position,is_primary,source,source_url,approval_status,rights_status),anomalies:supplier_anomalies(id,anomaly_type,severity,status,price_type,observed_price,message,last_detected_at)",
      id: `eq.${productId}`,
      supplier_id: `eq.${supplierId}`,
      "anomalies.status": "eq.open",
      "anomalies.order": "last_detected_at.desc",
      limit: "1",
    });
    const { rows } = await this.rows<ProductRow>(
      `supplier_products?${search}`,
      "No pudimos cargar el producto.",
    );
    const row = rows[0];
    if (!row) return null;
    const base = this.mapProduct(row);
    const current = new Map(
      asArray(row.all_prices).map((price) => [price.price_type, Number(price.current_price)]),
    );
    const candidates = candidatePrices(row.source_raw);
    const prices: AdminProductPrice[] = (["retail", "wholesale", "business", "cost"] as const).map(
      (type) => {
        const currentValue = current.get(type);
        if (Number.isFinite(currentValue) && Number(currentValue) > 0) {
          return { type, value: Number(currentValue), origin: "current" };
        }
        const candidate = candidates.get(type);
        return candidate
          ? { type, value: candidate, origin: "candidate" }
          : { type, value: null, origin: "unavailable" };
      },
    );
    const editorialRow = asArray(row.editorial)[0];
    const editorial: AdminProductEditorial = {
      nameOverride: editorialRow?.name_override ?? undefined,
      brandName: editorialRow?.brand_name ?? undefined,
      categorySlug: editorialRow?.category_slug ?? undefined,
      description: editorialRow?.description ?? undefined,
      tags: editorialRow?.tags ?? [],
      internalNotes: editorialRow?.internal_notes ?? undefined,
      status: editorialRow?.editorial_status ?? "draft",
    };
    const media = asArray(row.media)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary) || a.position - b.position)
      .map((item): AdminProductMedia => ({
        id: item.id,
        url: this.mediaUrl(item),
        alt: item.alt_text,
        position: item.position,
        isPrimary: item.is_primary,
        source: item.source,
        sourceUrl: item.source_url ?? undefined,
        byteSize: item.byte_size,
        mimeType: item.mime_type,
      }));
    return {
      ...base,
      supplierName: "VINROS",
      rawName: row.name_raw,
      rawPresentation: row.presentation_raw || row.normalized_presentation || "Unidad",
      prices,
      media,
      editorial,
      anomalies: asArray(row.anomalies).map((anomaly) => ({
        id: anomaly.id,
        type: anomaly.anomaly_type,
        severity: anomaly.severity,
        status: anomaly.status,
        priceType: anomaly.price_type ?? undefined,
        message: anomaly.message,
        observedPrice: anomaly.observed_price === null ? undefined : Number(anomaly.observed_price),
        lastDetectedAt: anomaly.last_detected_at,
      })),
      lastSeen: row.last_seen_at || "",
    };
  }

  private async productCount(supplierId: string, eligibility?: AdminProduct["eligibilityStatus"]) {
    const search = new URLSearchParams({
      select: "id",
      supplier_id: `eq.${supplierId}`,
      limit: "1",
    });
    if (eligibility) search.set("eligibility_status", `eq.${eligibility}`);
    const { response } = await this.rows<{ id: string }>(
      `supplier_products?${search}`,
      "No pudimos calcular el estado de VINROS.",
      "count=exact",
    );
    return contentRangeTotal(response, 0);
  }

  async getVinrosHealth(): Promise<VinrosHealth> {
    const supplierId = await this.supplierId();
    const automationSearch = new URLSearchParams({
      select:
        "started_at,finished_at,status,products,prices_changed,blocked,pending_review,supplier_only_cost,errors,error_summary,alert_status,alert_error_summary,dry_run_result,write_result",
      supplier_id: `eq.${supplierId}`,
      order: "started_at.desc",
      limit: "1",
    });
    const syncSearch = new URLSearchParams({
      select: "started_at,finished_at,status,prices_updated",
      supplier_id: `eq.${supplierId}`,
      order: "started_at.desc",
      limit: "1",
    });
    const alertSearch = new URLSearchParams({
      select: "id,anomaly_type,severity,status,price_type,observed_price,message,last_detected_at",
      supplier_id: `eq.${supplierId}`,
      status: "eq.open",
      order: "last_detected_at.desc",
      limit: "6",
    });
    const [total, safe, blocked, pendingReview, supplierOnlyCost, automationResult, syncResult, alertResult] =
      await Promise.all([
        this.productCount(supplierId),
        this.productCount(supplierId, "safe"),
        this.productCount(supplierId, "blocked"),
        this.productCount(supplierId, "pending_review"),
        this.productCount(supplierId, "supplier_only_cost"),
        this.rows<AutomationRunRow>(
          `supplier_sync_automation_runs?${automationSearch}`,
          "No pudimos cargar la última automatización VINROS.",
        ),
        this.rows<SyncRunRow>(
          `supplier_sync_runs?${syncSearch}`,
          "No pudimos cargar el último write VINROS.",
        ),
        this.rows<ProductAnomalyRow>(
          `supplier_anomalies?${alertSearch}`,
          "No pudimos cargar las alertas VINROS.",
        ),
      ]);
    const automation = automationResult.rows[0];
    const sync = syncResult.rows[0];
    const lastSyncAt = automation?.finished_at || automation?.started_at;
    const stale = !lastSyncAt || Date.now() - new Date(lastSyncAt).getTime() > 36 * 60 * 60_000;
    const blockedRun =
      !automation ||
      automation.dry_run_result?.policyCanWrite === false ||
      ["failed", "blocked"].includes(automation.status);
    const attention = stale || automation?.status !== "completed" || automation.errors > 0;
    const alerts = alertResult.rows.map((alert) => ({
      message: alert.message,
      severity: alert.severity,
      at: alert.last_detected_at,
    }));
    for (const reason of automation?.dry_run_result?.blockingReasons ?? []) {
      alerts.unshift({ message: reason, severity: "error", at: lastSyncAt || new Date().toISOString() });
    }
    if (automation?.error_summary) {
      alerts.unshift({ message: automation.error_summary, severity: "error", at: lastSyncAt || new Date().toISOString() });
    }
    return {
      status: blockedRun ? "blocked" : attention ? "attention" : "ok",
      lastSyncAt,
      nextSyncAt: nextVinrosSync(),
      total,
      safe,
      blocked,
      pendingReview,
      supplierOnlyCost,
      lastWriteAt: sync?.finished_at || sync?.started_at,
      pricesUpdated: sync?.prices_updated ?? automation?.write_result?.pricesUpdated ?? automation?.prices_changed ?? 0,
      alerts: alerts.slice(0, 6),
    };
  }

  async listVinrosReviewProducts(
    eligibility: "blocked" | "pending_review",
  ): Promise<VinrosReviewProduct[]> {
    const page = await this.listProducts({ eligibility, limit: 100 });
    const details = await Promise.all(page.products.map((product) => this.getProduct(product.id)));
    return details.filter((product): product is AdminProductDetail => Boolean(product)).map((product) => ({
      ...product,
      reviewReason:
        product.anomalies[0]?.message ||
        (eligibility === "blocked"
          ? "El producto quedó bloqueado por los guardrails VINROS."
          : "El producto requiere revisión humana antes de publicar precios."),
    }));
  }

  async saveProductEditorial(
    productId: string,
    input: AdminProductEditorial,
    operatorUserId: string,
  ) {
    if (!UUID_PATTERN.test(productId)) throw new AdminStoreError("Producto inválido.", 400);
    const product = await this.getProduct(productId);
    if (!product) throw new AdminStoreError("Producto no encontrado.", 404);
    const response = await this.request("supplier_product_editorial?on_conflict=supplier_product_id", {
      method: "POST",
      body: JSON.stringify({
        supplier_product_id: productId,
        name_override: input.nameOverride || null,
        brand_name: input.brandName || null,
        category_slug: input.categorySlug || null,
        description: input.description || null,
        tags: input.tags,
        internal_notes: input.internalNotes || null,
        editorial_status: input.status,
        updated_by: operatorUserId,
      }),
    }, "resolution=merge-duplicates,return=minimal");
    if (!response.ok) throw new AdminStoreError("No pudimos guardar los datos editoriales.", 502);
  }

  private async rpc(name: string, body: Record<string, unknown>) {
    const response = await this.request(`rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new AdminStoreError("No pudimos actualizar las imágenes.", 502);
    return response;
  }

  async uploadProductImage(input: {
    productId: string;
    bytes: Uint8Array;
    mimeType: string;
    altText: string;
    sourceUrl?: string;
    makePrimary: boolean;
    workflow?: "public_media" | "source_master";
    operatorUserId: string;
  }) {
    const product = await this.getProduct(input.productId);
    if (!product) throw new AdminStoreError("Producto no encontrado.", 404);
    const extensions: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/avif": "avif",
    };
    const extension = extensions[input.mimeType];
    if (!extension || input.bytes.byteLength < 20 || input.bytes.byteLength > 5 * 1024 * 1024) {
      throw new AdminStoreError("La imagen debe ser JPG, PNG, WebP o AVIF y pesar hasta 5 MB.", 422);
    }
    const sourceMaster = input.workflow === "source_master";
    if (sourceMaster && !input.sourceUrl) {
      throw new AdminStoreError("El source master necesita una URL de origen.", 422);
    }
    const path = sourceMaster
      ? `${input.productId}/masters/${randomUUID()}.${extension}`
      : `${input.productId}/${randomUUID()}.${extension}`;
    const storageHeaders: Record<string, string> = {
      apikey: this.secretKey,
      "Content-Type": input.mimeType,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    };
    if (!this.secretKey.startsWith("sb_secret_")) storageHeaders.Authorization = `Bearer ${this.secretKey}`;
    const upload = await this.fetcher(
      `${this.url}/storage/v1/object/product-media/${path}`,
      { method: "POST", headers: storageHeaders, body: Uint8Array.from(input.bytes).buffer, cache: "no-store" },
    );
    if (!upload.ok) throw new AdminStoreError("No pudimos subir la imagen.", 502);
    try {
      await this.rpc(sourceMaster ? "supplier_attach_product_source_master" : "supplier_attach_product_media", sourceMaster ? {
        p_supplier_product_id: input.productId,
        p_bucket_id: "product-media",
        p_storage_path: path,
        p_mime_type: input.mimeType,
        p_byte_size: input.bytes.byteLength,
        p_alt_text: input.altText,
        p_source_url: input.sourceUrl,
        p_created_by: input.operatorUserId,
      } : {
        p_supplier_product_id: input.productId,
        p_bucket_id: "product-media",
        p_storage_path: path,
        p_mime_type: input.mimeType,
        p_byte_size: input.bytes.byteLength,
        p_alt_text: input.altText,
        p_source: "manual_upload",
        p_source_url: input.sourceUrl || null,
        p_make_primary: input.makePrimary,
        p_created_by: input.operatorUserId,
      });
      if (!sourceMaster && input.makePrimary) {
        await this.rpc("supplier_mark_product_image_corrected", {
          p_supplier_product_id: input.productId,
        });
      }
    } catch (error) {
      await this.deleteStorageObject("product-media", path).catch(() => undefined);
      throw error;
    }
  }

  async listProductImageSystemPilot(): Promise<AdminProductImageRender[]> {
    const supplierId = await this.supplierId();
    const search = new URLSearchParams({
      select:
        "id,visual_variant,render_version,render_config,product:supplier_product_id!inner(id,supplier_id,supplier_sku,name_raw,presentation_raw,normalized_presentation,active,eligibility_status,retail_prices:supplier_prices(price_type,current_price),editorial:supplier_product_editorial(name_override,brand_name,category_slug,description,tags,internal_notes,editorial_status)),master:source_media_id!inner(id,bucket_id,storage_path,mime_type,byte_size,alt_text,position,is_primary,source,source_url,approval_status,rights_status)",
      status: "eq.approved",
      "render_config->>pilotOrder": "not.is.null",
      "product.supplier_id": `eq.${supplierId}`,
      "product.active": "eq.true",
      "product.eligibility_status": "eq.safe",
      limit: "20",
    });
    const { rows } = await this.rows<ProductImageRenderRow>(
      `supplier_product_image_renders?${search}`,
      "No pudimos cargar el piloto visual.",
    );

    return rows.flatMap((row): AdminProductImageRender[] => {
      const product = asArray(row.product)[0];
      const master = asArray(row.master)[0];
      if (!product || !master) return [];
      const editorial = asArray(product.editorial)[0];
      const price = Number(asArray(product.retail_prices).find((item) => item.price_type === "retail")?.current_price);
      return [{
        id: row.id,
        productId: product.id,
        sku: product.supplier_sku,
        name: editorial?.name_override?.trim() || product.name_raw,
        brand: editorial?.brand_name?.trim() || inferBrand(product.name_raw).name,
        presentation: product.normalized_presentation || product.presentation_raw || "Unidad",
        price: Number.isFinite(price) && price > 0 ? price : null,
        masterUrl: this.mediaUrl(master),
        masterAlt: master.alt_text,
        source: master.source,
        sourceUrl: master.source_url ?? undefined,
        variant: row.visual_variant,
        renderVersion: row.render_version,
      }];
    }).sort((a, b) => {
      const aRow = rows.find((row) => row.id === a.id);
      const bRow = rows.find((row) => row.id === b.id);
      return Number(aRow?.render_config?.pilotOrder ?? 0) - Number(bRow?.render_config?.pilotOrder ?? 0);
    });
  }

  private async deleteStorageObject(bucket: string, path: string) {
    const headers = this.headers();
    delete headers["Content-Type"];
    const response = await this.fetcher(
      `${this.url}/storage/v1/object/${encodeURIComponent(bucket)}/${path.split("/").map(encodeURIComponent).join("/")}`,
      { method: "DELETE", headers, cache: "no-store" },
    );
    if (!response.ok && response.status !== 404) throw new AdminStoreError("La imagen se quitó del catálogo, pero el archivo requiere limpieza.", 502);
  }

  async setPrimaryMedia(productId: string, mediaId: string) {
    await this.rpc("supplier_set_primary_media", {
      p_supplier_product_id: productId,
      p_media_id: mediaId,
    });
  }

  async reorderProductMedia(productId: string, mediaIds: string[]) {
    await this.rpc("supplier_reorder_product_media", {
      p_supplier_product_id: productId,
      p_media_ids: mediaIds,
    });
  }

  async deleteProductMedia(productId: string, mediaId: string) {
    const response = await this.rpc("supplier_delete_product_media", {
      p_supplier_product_id: productId,
      p_media_id: mediaId,
    });
    const payload = (await response.json()) as { bucketId?: string; storagePath?: string };
    if (payload.bucketId && payload.storagePath) {
      await this.deleteStorageObject(payload.bucketId, payload.storagePath);
    }
  }

  async listImageCandidates(input: {
    offset?: number;
    limit?: number;
    status?: MatchReviewStatus;
    confidenceBand?: MatchConfidenceBand;
    publicationStatus?: "pending" | "approved" | "rejected";
    approvalMode?: "auto";
    qualityStatus?: ImageQualityStatus;
    runId?: string;
    riskVersion?: 2;
  } = {}): Promise<AdminImageCandidatePage> {
    const supplierId = await this.supplierId();
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(10, Math.trunc(input.limit ?? 25)));
    const search = new URLSearchParams({
      select:
        "id,external_product_match_id,source,source_url,image_url,match_confidence,match_review_status,approval_status,rights_status,quality_status,provenance,created_at,product:supplier_product_id!inner(id,supplier_sku,name_raw,presentation_raw,normalized_presentation,supplier_id)",
      "product.supplier_id": `eq.${supplierId}`,
      order: input.qualityStatus === "needs_review"
        ? "provenance->>reviewRiskRank.asc.nullslast,provenance->>reviewPriorityScore.desc.nullslast,match_confidence.asc,created_at.asc,id.asc"
        : "match_confidence.desc,created_at.asc,id.asc",
      offset: String(offset),
      limit: String(limit),
    });
    if (input.status) search.set("match_review_status", `eq.${input.status}`);
    if (input.publicationStatus) search.set("approval_status", `eq.${input.publicationStatus}`);
    if (input.approvalMode === "auto") {
      search.set("provenance->>approvalMode", "in.(auto_exact_high,auto_high,auto_medium)");
    }
    if (input.qualityStatus) search.set("quality_status", `eq.${input.qualityStatus}`);
    if (input.runId) search.set("provenance->>runId", `eq.${input.runId}`);
    if (input.riskVersion) search.set("provenance->>reviewRiskVersion", `eq.${input.riskVersion}`);
    if (input.confidenceBand === "high") search.set("match_confidence", "gte.0.9");
    if (input.confidenceBand === "medium") {
      search.append("match_confidence", "gte.0.72");
      search.append("match_confidence", "lt.0.9");
    }
    if (input.confidenceBand === "low") search.set("match_confidence", "lt.0.72");
    const { rows, response } = await this.rows<ImageCandidateRow>(
      `external_image_candidates?${search}`,
      "No pudimos cargar los candidatos de imágenes.",
      "count=exact",
    );
    const candidates = rows.flatMap((row): AdminImageCandidate[] => {
      const product = asArray(row.product)[0];
      if (!product) return [];
      const confidence = Number(row.match_confidence);
      const matchedFields = Array.isArray(row.provenance?.matchedFields)
        ? row.provenance.matchedFields.filter((item): item is string => typeof item === "string")
        : [];
      const mismatchWarnings = Array.isArray(row.provenance?.mismatchWarnings)
        ? row.provenance.mismatchWarnings.filter((item): item is string => typeof item === "string")
        : [];
      const hardConflicts = Array.isArray(row.provenance?.hardConflicts)
        ? row.provenance.hardConflicts.filter((item): item is string => typeof item === "string")
        : [];
      return [{
        id: row.id,
        matchId: row.external_product_match_id ?? undefined,
        productId: product.id,
        sku: product.supplier_sku,
        productName: product.name_raw,
        presentation: product.normalized_presentation || product.presentation_raw || "Unidad",
        category: categoryForSupplierSku(product.supplier_sku).name,
        externalProductName:
          typeof row.provenance?.externalProductName === "string"
            ? row.provenance.externalProductName
            : product.name_raw,
        externalPresentation:
          typeof row.provenance?.externalPresentation === "string"
            ? row.provenance.externalPresentation
            :
          matchedFields.find((item) => /(?:\d+[,.]?\d*)\s*(?:ml|cc|cl|l|g|kg|oz|unidades?|c[aá]psulas?)/iu.test(item))
          || "No informada por la fuente",
        source: row.source,
        sourceUrl: row.source_url,
        imageUrl: row.image_url,
        confidence,
        confidenceBand: confidence >= 0.9 ? "high" : confidence >= 0.72 ? "medium" : "low",
        evidence: matchedFields,
        mismatchWarnings: [...new Set([...mismatchWarnings, ...hardConflicts])],
        reviewRiskRank: [1, 2, 3, 4, 5, 6].includes(Number(row.provenance?.reviewRiskRank))
          ? Number(row.provenance?.reviewRiskRank) as 1 | 2 | 3 | 4 | 5 | 6
          : 6,
        reviewRiskKind: ["product", "brand_line", "varietal", "presentation_volume", "pack_unit", "confidence"].includes(String(row.provenance?.reviewRiskKind))
          ? row.provenance?.reviewRiskKind as AdminImageCandidate["reviewRiskKind"]
          : "confidence",
        reviewRiskReason: typeof row.provenance?.reviewRiskReason === "string"
          ? row.provenance.reviewRiskReason
          : "Menor confianza; revisión general",
        reviewPriorityScore: Number.isFinite(Number(row.provenance?.reviewPriorityScore))
          ? Number(row.provenance?.reviewPriorityScore)
          : Math.round((1 - confidence) * 100),
        matchReviewStatus: row.match_review_status,
        publicationStatus: row.approval_status,
        rightsStatus: row.rights_status,
        qualityStatus: row.quality_status,
        createdAt: row.created_at,
      }];
    });
    const total = contentRangeTotal(response, offset + candidates.length);
    return { candidates, total, offset, limit, hasMore: offset + candidates.length < total };
  }

  async listProductsWithoutImageMatch(input: { offset?: number; limit?: number } = {}): Promise<AdminUnmatchedImageProductPage> {
    const supplierId = await this.supplierId();
    const offset = Math.max(0, Math.trunc(input.offset ?? 0));
    const limit = Math.min(100, Math.max(10, Math.trunc(input.limit ?? 25)));
    const search = new URLSearchParams({
      select: "id,supplier_sku,name_raw,presentation",
      supplier_id: `eq.${supplierId}`,
      order: "name_raw.asc,id.asc",
      offset: String(offset),
      limit: String(limit),
    });
    const { rows, response } = await this.rows<{
      id: string;
      supplier_sku: string;
      name_raw: string;
      presentation: string;
    }>(`supplier_products_without_image_match?${search}`, "No pudimos cargar los productos sin match.", "count=exact");
    const products = rows.map((row) => ({
      id: row.id,
      sku: row.supplier_sku,
      name: row.name_raw,
      presentation: row.presentation,
    }));
    const total = contentRangeTotal(response, offset + products.length);
    return { products, total, offset, limit, hasMore: offset + products.length < total };
  }

  async importMassImageCandidates(items: unknown[]) {
    const response = await this.rpc("supplier_import_mass_image_candidates", { p_items: items });
    return await response.json() as Array<{ candidate_id: string; auto_publish: boolean }>;
  }

  async setMassImageCandidateReviewRisks(items: unknown[]) {
    await this.rpc("supplier_set_image_candidate_review_risks", { p_items: items });
  }

  async reviewPublishedImageCandidate(
    candidateId: string,
    action: "correct" | "remove" | "search_other",
    reviewerId: string,
  ) {
    if (!UUID_PATTERN.test(candidateId)) throw new AdminStoreError("Candidato inválido.", 400);
    await this.rpc("supplier_review_published_image", {
      p_candidate_id: candidateId,
      p_action: action,
      p_reviewer: reviewerId,
    });
  }

  async reviewImageCandidate(
    candidateId: string,
    status: Exclude<MatchReviewStatus, "pending">,
    reviewerId: string,
  ) {
    if (!UUID_PATTERN.test(candidateId)) throw new AdminStoreError("Candidato inválido.", 400);
    const supplierId = await this.supplierId();
    const verify = new URLSearchParams({
      select: "id,product:supplier_product_id!inner(supplier_id)",
      id: `eq.${candidateId}`,
      "product.supplier_id": `eq.${supplierId}`,
      limit: "1",
    });
    const { rows } = await this.rows<{ id: string }>(
      `external_image_candidates?${verify}`,
      "No pudimos validar el candidato.",
    );
    if (!rows[0]) throw new AdminStoreError("Candidato no encontrado.", 404);
    const response = await this.request(
      `external_image_candidates?id=eq.${candidateId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          match_review_status: status,
          reviewed_by: reviewerId,
          reviewed_at: new Date().toISOString(),
        }),
      },
      "return=minimal",
    );
    if (!response.ok) throw new AdminStoreError("No pudimos guardar la revisión.", 502);
  }

  async publishApprovedImageCandidate(candidateId: string, operatorUserId: string | null) {
    if (!UUID_PATTERN.test(candidateId)) throw new AdminStoreError("Candidato inválido.", 400);
    const supplierId = await this.supplierId();
    const search = new URLSearchParams({
      select: "id,supplier_product_id,source_url,image_url,match_review_status,approval_status,product:supplier_product_id!inner(supplier_id,supplier_sku,name_raw,active,eligibility_status)",
      id: `eq.${candidateId}`,
      "product.supplier_id": `eq.${supplierId}`,
      limit: "1",
    });
    const { rows } = await this.rows<PublishableImageCandidateRow>(
      `external_image_candidates?${search}`,
      "No pudimos validar el candidato.",
    );
    const candidate = rows[0];
    const product = candidate ? asArray(candidate.product)[0] : undefined;
    if (!candidate || !product) throw new AdminStoreError("Candidato no encontrado.", 404);
    if (candidate.match_review_status !== "approved") {
      throw new AdminStoreError("El match debe aprobarse antes de publicar.", 409);
    }
    if (candidate.approval_status === "approved") return;
    if (candidate.approval_status !== "pending" || !product.active || product.eligibility_status !== "safe") {
      throw new AdminStoreError("El candidato ya no puede publicarse.", 409);
    }

    const preferredSourceImage = candidate.image_url.replace(
      /-480-0([.](?:webp|avif|png|jpe?g))$/i,
      "-1024-1024$1",
    );
    const fetchExternal = async (rawUrl: string, accept: string) => {
      let url = await assertPublicHttpsUrl(rawUrl);
      let response: Response | undefined;
      for (let redirect = 0; redirect < 4; redirect += 1) {
        response = await this.fetcher(url, {
          method: "GET",
          redirect: "manual",
          headers: { "User-Agent": "LombardoProductMedia/1.0", Accept: accept },
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get("location");
        if (!location) throw new AdminStoreError("La fuente externa redirigió sin destino.", 422);
        url = await assertPublicHttpsUrl(new URL(location, url).toString());
      }
      if (!response) throw new AdminStoreError("La fuente externa no respondió.", 502);
      return { url, response };
    };
    let external = await fetchExternal(preferredSourceImage, "image/avif,image/webp,image/png,image/jpeg");
    let imageUrl = external.url;
    let imageResponse = external.response;
    let mimeType = (imageResponse.headers.get("content-type") || "").split(";")[0].trim();
    const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    if (!imageResponse.ok || !imageTypes.has(mimeType)) {
      const page = imageResponse.ok && (mimeType === "text/html" || mimeType === "application/xhtml+xml")
        ? { url: imageUrl, response: imageResponse }
        : await fetchExternal(candidate.source_url, "text/html,application/xhtml+xml");
      if (!page.response.ok) throw new AdminStoreError("No pudimos recuperar la página de origen aprobada.", 502);
      const declaredHtmlBytes = Number(page.response.headers.get("content-length") || 0);
      if (declaredHtmlBytes > 1_000_000) throw new AdminStoreError("La página de origen es demasiado grande.", 422);
      const html = (await page.response.text()).slice(0, 1_000_000);
      const resolved = htmlImageCandidate(html, page.url);
      if (!resolved) throw new AdminStoreError("La página de origen no publica una imagen utilizable.", 422);
      external = await fetchExternal(resolved, "image/avif,image/webp,image/png,image/jpeg");
      imageUrl = external.url;
      imageResponse = external.response;
      mimeType = (imageResponse.headers.get("content-type") || "").split(";")[0].trim();
    }
    if (!imageResponse.ok) throw new AdminStoreError("No pudimos descargar la imagen indicada por la fuente.", 502);
    const extensions: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif" };
    const extension = extensions[mimeType];
    const declaredBytes = Number(imageResponse.headers.get("content-length") || 0);
    if (!extension || declaredBytes > 5 * 1024 * 1024) {
      throw new AdminStoreError("La imagen aprobada no tiene un formato o tamaño permitido.", 422);
    }
    const bytes = new Uint8Array(await imageResponse.arrayBuffer());
    if (bytes.byteLength < 20 || bytes.byteLength > 5 * 1024 * 1024 || !validImageBytes(bytes, mimeType)) {
      throw new AdminStoreError("El archivo externo no coincide con una imagen válida de hasta 5 MB.", 422);
    }
    const contentSha256 = createHash("sha256").update(bytes).digest("hex");
    const encodedFilename = imageUrl.pathname.split("/").pop() || `source.${extension}`;
    let sourceFilename = encodedFilename;
    try {
      sourceFilename = decodeURIComponent(encodedFilename);
    } catch {
      sourceFilename = encodedFilename;
    }
    sourceFilename = sourceFilename.slice(0, 240);

    const path = `${product.supplier_sku.toLocaleLowerCase("en-US")}/${randomUUID()}.${extension}`;
    const bucketId = "product-media";
    let uploaded = false;
    const storageHeaders: Record<string, string> = {
      apikey: this.secretKey,
      "Content-Type": mimeType,
      "Cache-Control": "31536000",
      "x-upsert": "false",
    };
    if (!this.secretKey.startsWith("sb_secret_")) storageHeaders.Authorization = `Bearer ${this.secretKey}`;
    const upload = await this.fetcher(`${this.url}/storage/v1/object/product-media/${path}`, {
      method: "POST",
      headers: storageHeaders,
      body: Uint8Array.from(bytes).buffer,
      cache: "no-store",
    });
    if (!upload.ok) throw new AdminStoreError("No pudimos guardar la imagen aprobada.", 502);
    uploaded = true;
    try {
      await this.rpc("supplier_publish_external_candidate_v2", {
        p_candidate_id: candidate.id,
        p_bucket_id: bucketId,
        p_storage_path: path,
        p_mime_type: mimeType,
        p_byte_size: bytes.byteLength,
        p_alt_text: `Imagen de ${product.name_raw}`,
        p_created_by: operatorUserId,
        p_source_image_url: imageUrl.toString(),
        p_source_filename: sourceFilename,
        p_content_sha256: contentSha256,
        p_fetched_at: new Date().toISOString(),
      });
    } catch (error) {
      if (uploaded) await this.deleteStorageObject(bucketId, path).catch(() => undefined);
      throw error;
    }
  }

  async authorizeImageJob(jobId: string, tokenHash: string) {
    if (!UUID_PATTERN.test(jobId) || !/^[0-9a-f]{64}$/.test(tokenHash)) return null;
    const tenantId = await this.tenantRecordId();
    const search = new URLSearchParams({
      select: "id,status,expires_at,items_total,items_processed",
      id: `eq.${jobId}`,
      tenant_id: `eq.${tenantId}`,
      token_hash: `eq.${tokenHash}`,
      status: "in.(ready,running)",
      expires_at: `gt.${new Date().toISOString()}`,
      limit: "1",
    });
    const { rows } = await this.rows<{ id: string; status: string; expires_at: string; items_total: number; items_processed: number }>(
      `supplier_image_jobs?${search}`,
      "No pudimos validar el trabajo de imágenes.",
    );
    return rows[0] || null;
  }

  async recordImageJobBatch(jobId: string, input: {
    processed: number;
    published: number;
    failed: number;
    errorSummary?: string;
    complete: boolean;
  }) {
    await this.rpc("supplier_record_image_job_batch", {
      p_job_id: jobId,
      p_processed: input.processed,
      p_published: input.published,
      p_failed: input.failed,
      p_error_summary: input.errorSummary || null,
      p_complete: input.complete,
    });
  }

  private mapCustomer(
    row: CustomerAccountRow,
    orders: AdminOrder[] = [],
  ): AdminCustomer {
    return {
      id: row.id,
      authUserId: row.auth_user_id ?? undefined,
      name: row.name,
      email: row.email ?? "",
      whatsapp: row.whatsapp_phone ?? row.phone ?? "",
      accountType: row.account_type,
      pricingPolicy: row.pricing_policy,
      discountPercent: Number(row.discount_percent),
      status: row.status,
      orderCount: orders.length,
      lastOrderAt: orders[0]?.createdAt,
      historicalTotal: orders.reduce((sum, order) => sum + order.total, 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async customerRows(customerId?: string) {
    const tenantRecordId = await this.tenantRecordId();
    const search = new URLSearchParams({
      select:
        "id,tenant_id,auth_user_id,name,email,phone,whatsapp_phone,account_type,pricing_policy,discount_percent,status,created_at,updated_at",
      tenant_id: `eq.${tenantRecordId}`,
      order: "updated_at.desc,id.asc",
      limit: customerId ? "1" : "1000",
    });
    if (customerId) search.set("id", `eq.${customerId}`);
    return this.rows<CustomerAccountRow>(
      `customer_accounts?${search}`,
      "No pudimos cargar las cuentas de clientes.",
    );
  }

  private async customerOrders(customerId: string) {
    const search = new URLSearchParams({
      select: ORDER_SELECT,
      tenant_id: `eq.${this.tenantId}`,
      customer_account_id: `eq.${customerId}`,
      order: "created_at.desc",
      limit: "1000",
    });
    const { rows } = await this.rows<OrderRow>(
      `commerce_orders?${search}`,
      "No pudimos cargar los pedidos del cliente.",
    );
    return rows.map(mapOrder);
  }

  async listCustomers(): Promise<AdminCustomer[]> {
    const { rows } = await this.customerRows();
    const orders = await this.listOrders({}, 1000);
    const byCustomer = new Map<string, AdminOrder[]>();
    for (const order of orders) {
      if (!order.customerAccountId) continue;
      const current = byCustomer.get(order.customerAccountId) ?? [];
      current.push(order);
      byCustomer.set(order.customerAccountId, current);
    }
    return rows.map((row) => this.mapCustomer(row, byCustomer.get(row.id) ?? []));
  }

  async getCustomer(customerId: string): Promise<AdminCustomerDetail | null> {
    if (!UUID_PATTERN.test(customerId)) return null;
    const { rows } = await this.customerRows(customerId);
    const row = rows[0];
    if (!row) return null;
    const orders = await this.customerOrders(row.id);
    return { ...this.mapCustomer(row, orders), orders };
  }

  async getCustomerOrderContext(customerId: string): Promise<{
    customer: AdminCustomer;
    pricingContext: CustomerPricingContext;
  } | null> {
    if (!UUID_PATTERN.test(customerId)) return null;
    const { rows } = await this.customerRows(customerId);
    const row = rows[0];
    if (!row || row.status !== "active") return null;

    const coherentPolicy =
      (row.account_type === "RETAIL" &&
        (row.pricing_policy === "RETAIL" || row.pricing_policy === "CUSTOM_DISCOUNT")) ||
      (row.account_type === "WHOLESALE" && row.pricing_policy === "WHOLESALE") ||
      (row.account_type === "BUSINESS" && row.pricing_policy === "BUSINESS");
    const discountPercent = Number(row.discount_percent);
    const validDiscount = row.pricing_policy === "CUSTOM_DISCOUNT"
      ? Number.isFinite(discountPercent) && discountPercent > 0 && discountPercent < 100
      : discountPercent === 0;
    if (!coherentPolicy || !validDiscount) return null;

    const basePriceType = row.pricing_policy === "WHOLESALE"
      ? "wholesale"
      : row.pricing_policy === "BUSINESS"
        ? "business"
        : "retail";

    return {
      customer: this.mapCustomer(row),
      pricingContext: {
        tenantRecordId: row.tenant_id,
        tenantSlug: this.tenantId,
        authUserId: row.auth_user_id ?? undefined,
        customerAccountId: row.id,
        accountType: row.account_type,
        policy: row.pricing_policy,
        basePriceType,
        discountPercent,
        contextKey: [
          "admin-order",
          row.id,
          row.pricing_policy,
          String(discountPercent),
        ].join(":"),
      },
    };
  }

  async getGuestOrderPricingContext(): Promise<CustomerPricingContext> {
    return {
      tenantRecordId: await this.tenantRecordId(),
      tenantSlug: this.tenantId,
      accountType: "RETAIL",
      policy: "RETAIL",
      basePriceType: "retail",
      discountPercent: 0,
      contextKey: "admin-order:guest:RETAIL",
    };
  }

  async createCustomerAccount(input: AdminCustomerInput, authUserId: string) {
    if (!UUID_PATTERN.test(authUserId)) {
      throw new AdminStoreError("El usuario autenticado del cliente no es válido.", 422);
    }
    const tenantRecordId = await this.tenantRecordId();
    const response = await this.request(
      "customer_accounts?select=id",
      {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantRecordId,
          auth_user_id: authUserId,
          name: input.name,
          email: input.email,
          phone: input.whatsapp,
          whatsapp_phone: input.whatsapp,
          account_type: input.accountType,
          pricing_policy: input.pricingPolicy,
          discount_percent: input.discountPercent,
          status: input.status,
        }),
      },
      "return=representation",
    );
    if (!response.ok) {
      throw new AdminStoreError(
        response.status === 409
          ? "Ya existe una cuenta para ese email."
          : "No pudimos crear la cuenta del cliente.",
        response.status === 409 ? 409 : 502,
      );
    }
    const created = (await response.json()) as Array<{ id: string }>;
    if (!created[0]?.id) {
      throw new AdminStoreError("Runia no devolvió la cuenta creada.", 502);
    }
    return created[0].id;
  }

  async updateCustomerAccount(customerId: string, input: AdminCustomerInput) {
    if (!UUID_PATTERN.test(customerId)) {
      throw new AdminStoreError("Cliente inválido.", 422);
    }
    const tenantRecordId = await this.tenantRecordId();
    const search = new URLSearchParams({
      id: `eq.${customerId}`,
      tenant_id: `eq.${tenantRecordId}`,
      select: "id",
    });
    const response = await this.request(
      `customer_accounts?${search}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          email: input.email,
          phone: input.whatsapp,
          whatsapp_phone: input.whatsapp,
          account_type: input.accountType,
          pricing_policy: input.pricingPolicy,
          discount_percent: input.discountPercent,
          status: input.status,
        }),
      },
      "return=representation",
    );
    if (!response.ok) {
      throw new AdminStoreError(
        response.status === 409
          ? "El email ya pertenece a otra cuenta."
          : "No pudimos actualizar el cliente.",
        response.status === 409 ? 409 : 502,
      );
    }
    const updated = (await response.json()) as Array<{ id: string }>;
    if (!updated[0]) throw new AdminStoreError("Cliente no encontrado.", 404);
  }

  private async promotionRelations(tenantRecordId: string) {
    const tenant = `tenant_id=eq.${encodeURIComponent(tenantRecordId)}&limit=10000`;
    const [products, categories, customers, redemptions] = await Promise.all([
      this.rows<{ promotion_id: string; product_id: string }>(`commerce_promotion_products?select=promotion_id,product_id&${tenant}`, "No pudimos cargar los productos de promociones."),
      this.rows<{ promotion_id: string; category_slug: string }>(`commerce_promotion_categories?select=promotion_id,category_slug&${tenant}`, "No pudimos cargar las categorías de promociones."),
      this.rows<{ promotion_id: string; customer_account_id: string }>(`commerce_promotion_customers?select=promotion_id,customer_account_id&${tenant}`, "No pudimos cargar los clientes de promociones."),
      this.rows<{ id: number; promotion_id: string; order_id: number; customer_account_id: string | null; status: "RESERVED" | "CONSUMED" | "RELEASED"; discount_amount: number | string; reserved_at: string; reservation_expires_at: string; consumed_at: string | null; released_at: string | null }>(`commerce_promotion_redemptions?select=id,promotion_id,order_id,customer_account_id,status,discount_amount,reserved_at,reservation_expires_at,consumed_at,released_at&${tenant}`, "No pudimos cargar los usos de promociones."),
    ]);
    return { products: products.rows, categories: categories.rows, customers: customers.rows, redemptions: redemptions.rows };
  }

  async listPromotions(): Promise<AdminPromotion[]> {
    const tenantRecordId = await this.tenantRecordId();
    const search = new URLSearchParams({
      select: "id,code,name,description,status,discount_type,discount_value,start_at,end_at,minimum_order_amount,max_total_uses,max_uses_per_customer,applies_to,customer_scope,stackable,first_order_only,created_at,updated_at",
      tenant_id: `eq.${tenantRecordId}`,
      order: "updated_at.desc",
      limit: "1000",
    });
    const [{ rows }, relations] = await Promise.all([
      this.rows<PromotionRow>(`commerce_promotions?${search}`, "No pudimos cargar las promociones."),
      this.promotionRelations(tenantRecordId),
    ]);
    const now = Date.now();
    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      discountType: row.discount_type,
      discountValue: Number(row.discount_value),
      startAt: row.start_at ?? undefined,
      endAt: row.end_at ?? undefined,
      minimumOrderAmount: Number(row.minimum_order_amount),
      maxTotalUses: row.max_total_uses ?? undefined,
      maxUsesPerCustomer: row.max_uses_per_customer ?? undefined,
      appliesTo: row.applies_to,
      customerScope: row.customer_scope,
      stackable: row.stackable,
      firstOrderOnly: row.first_order_only,
      productIds: relations.products.filter((item) => item.promotion_id === row.id).map((item) => item.product_id),
      categorySlugs: relations.categories.filter((item) => item.promotion_id === row.id).map((item) => item.category_slug),
      customerAccountIds: relations.customers.filter((item) => item.promotion_id === row.id).map((item) => item.customer_account_id),
      reservedUses: relations.redemptions.filter((item) => item.promotion_id === row.id && item.status === "RESERVED" && new Date(item.reservation_expires_at).getTime() > now).length,
      consumedUses: relations.redemptions.filter((item) => item.promotion_id === row.id && item.status === "CONSUMED").length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      uses: relations.redemptions.filter((item) => item.promotion_id === row.id).map((item) => ({
        id: String(item.id),
        orderId: String(item.order_id),
        customerAccountId: item.customer_account_id ?? undefined,
        status: item.status,
        discountAmount: Number(item.discount_amount),
        reservedAt: item.reserved_at,
        reservationExpiresAt: item.reservation_expires_at,
        consumedAt: item.consumed_at ?? undefined,
        releasedAt: item.released_at ?? undefined,
      })),
    }));
  }

  async getPromotion(promotionId: string) {
    if (!UUID_PATTERN.test(promotionId)) return null;
    return (await this.listPromotions()).find((promotion) => promotion.id === promotionId) ?? null;
  }

  private async replacePromotionScopes(tenantRecordId: string, promotionId: string, input: AdminPromotionInput) {
    const query = `tenant_id=eq.${encodeURIComponent(tenantRecordId)}&promotion_id=eq.${encodeURIComponent(promotionId)}`;
    for (const table of ["commerce_promotion_products", "commerce_promotion_categories", "commerce_promotion_customers"]) {
      const response = await this.request(`${table}?${query}`, { method: "DELETE" });
      if (!response.ok) throw new AdminStoreError("No pudimos actualizar el alcance de la promoción.", 502);
    }
    const inserts: Array<[string, object[]]> = [
      ["commerce_promotion_products", input.productIds.map((productId) => ({ tenant_id: tenantRecordId, promotion_id: promotionId, product_id: productId }))],
      ["commerce_promotion_categories", input.categorySlugs.map((categorySlug) => ({ tenant_id: tenantRecordId, promotion_id: promotionId, category_slug: categorySlug }))],
      ["commerce_promotion_customers", input.customerAccountIds.map((customerAccountId) => ({ tenant_id: tenantRecordId, promotion_id: promotionId, customer_account_id: customerAccountId }))],
    ];
    for (const [table, body] of inserts) {
      if (!body.length) continue;
      const response = await this.request(table, { method: "POST", body: JSON.stringify(body) });
      if (!response.ok) throw new AdminStoreError("No pudimos guardar el alcance de la promoción.", 502);
    }
  }

  private promotionPayload(input: AdminPromotionInput) {
    return {
      code: input.code,
      name: input.name,
      description: input.description,
      status: input.status,
      discount_type: input.discountType,
      discount_value: input.discountValue,
      start_at: input.startAt ?? null,
      end_at: input.endAt ?? null,
      minimum_order_amount: input.minimumOrderAmount,
      max_total_uses: input.maxTotalUses ?? null,
      max_uses_per_customer: input.maxUsesPerCustomer ?? null,
      applies_to: input.appliesTo,
      customer_scope: input.customerScope,
      stackable: input.stackable,
      first_order_only: input.firstOrderOnly,
    };
  }

  async createPromotion(input: AdminPromotionInput, operatorUserId: string) {
    const tenantRecordId = await this.tenantRecordId();
    const response = await this.request("commerce_promotions?select=id", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantRecordId, created_by: operatorUserId, ...this.promotionPayload(input) }),
    }, "return=representation");
    if (!response.ok) throw new AdminStoreError(response.status === 409 ? "Ya existe una promoción con ese código." : "No pudimos crear la promoción.", response.status === 409 ? 409 : 502);
    const rows = (await response.json()) as Array<{ id: string }>;
    if (!rows[0]?.id) throw new AdminStoreError("Runia no devolvió la promoción creada.", 502);
    await this.replacePromotionScopes(tenantRecordId, rows[0].id, input);
    return rows[0].id;
  }

  async updatePromotion(promotionId: string, input: AdminPromotionInput) {
    if (!UUID_PATTERN.test(promotionId)) throw new AdminStoreError("Promoción inválida.", 422);
    const tenantRecordId = await this.tenantRecordId();
    const search = new URLSearchParams({ id: `eq.${promotionId}`, tenant_id: `eq.${tenantRecordId}`, select: "id" });
    const response = await this.request(`commerce_promotions?${search}`, { method: "PATCH", body: JSON.stringify(this.promotionPayload(input)) }, "return=representation");
    if (!response.ok) throw new AdminStoreError(response.status === 409 ? "Ya existe una promoción con ese código." : "No pudimos actualizar la promoción.", response.status === 409 ? 409 : 502);
    const rows = (await response.json()) as Array<{ id: string }>;
    if (!rows[0]) throw new AdminStoreError("Promoción no encontrada.", 404);
    await this.replacePromotionScopes(tenantRecordId, promotionId, input);
  }
}
