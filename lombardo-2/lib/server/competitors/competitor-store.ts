import "server-only";

import { categoryForSupplierSku } from "@/lib/commerce/runia-catalog-mapper";
import { normalizeImageMatchText, volumeMl } from "@/lib/images/mass-image-matcher";
import type {
  ActiveCompetitorSlug,
  CheckoutType,
  CompetitorCommercialObservation,
  CompetitorAlertRule,
  CompetitorAlertType,
  CompetitorComparisonRow,
  CompetitorDashboard,
  CompetitorDashboardFilters,
  CompetitorMatchDecision,
  CompetitorProductDetail,
  CompetitorRunView,
  ExternalCompetitorProduct,
  MultiCompetitorDashboard,
  PriceSignal,
  PriceSource,
  RuniaCompetitorProduct,
  StockStatus,
} from "@/lib/competitors/types";
import { priceDifference } from "@/lib/competitors/matcher";
import {
  buildScenarioMatrix,
  pricingRecommendation,
  productMatchesTopTen,
  TOP_TEN_COMPETITOR_PRODUCTS,
} from "@/lib/competitors/pricing-intelligence";

interface StoreOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

export interface CompetitorRecord {
  id: string;
  tenantId: string;
  slug: string;
  name: string;
  crawlDelayMs: number;
  maxPages: number;
  circuitState: "closed" | "open";
  circuitReason?: string;
}

interface CompetitorRow {
  id: string;
  tenant_id: string;
  slug: string;
  name: string;
  crawl_delay_ms: number;
  max_pages: number;
  circuit_state: "closed" | "open";
  circuit_reason: string | null;
}

interface RuniaRow {
  id: string;
  supplier_sku: string;
  name_raw: string;
  presentation_raw: string | null;
  normalized_presentation: string | null;
  source_raw: Record<string, unknown> | null;
  retail_prices: Array<{ price_type: string; current_price: number | string }> | { price_type: string; current_price: number | string } | null;
  editorial: Array<{ brand_name: string | null; category_slug: string | null }> | { brand_name: string | null; category_slug: string | null } | null;
}

interface AlertRow {
  id: string;
  alert_type: CompetitorAlertType;
  enabled: boolean;
  threshold_pct: number | string;
  cooldown_hours: number;
}

interface ComparisonRuniaRow {
  id: string;
  supplier_sku: string;
  name_raw: string;
  retail_prices: Array<{ price_type: string; current_price: number | string }> | { price_type: string; current_price: number | string } | null;
  lombardo_prices: Array<{ price_type: string; current_price: number | string; active: boolean }> | { price_type: string; current_price: number | string; active: boolean } | null;
  editorial: Array<{ brand_name: string | null; category_slug: string | null }> | { brand_name: string | null; category_slug: string | null } | null;
}

interface ComparisonMatchRow {
  runia_product_id: string | null;
  suggested_runia_product_id: string | null;
  match_confidence: number | string;
  confidence_band: "high" | "medium" | "low" | "none";
  match_method: "auto" | "manual" | "none" | "rejected";
  manual_override: boolean;
  matched_fields: string[];
  conflicts: string[];
  runia: ComparisonRuniaRow | ComparisonRuniaRow[] | null;
}

interface ComparisonProductRow {
  id: string;
  external_name: string;
  external_product_url: string;
  brand: string | null;
  current_price: number | string | null;
  list_price: number | string | null;
  promotion_text: string | null;
  fetched_at: string;
  available: boolean;
  match: ComparisonMatchRow | ComparisonMatchRow[] | null;
}

interface CompetitorSourceRow {
  slug: ActiveCompetitorSlug;
  name: string;
  priority: "high" | "medium" | "secondary" | "b2b";
  price_source: PriceSource;
  checkout_type: CheckoutType;
  active: boolean;
}

interface MarketObservationRow {
  id: string;
  product_key: string;
  external_name: string;
  source_url: string | null;
  list_price: number | string | null;
  promotional_price: number | string | null;
  transfer_price: number | string | null;
  transfer_discount_pct: number | string | null;
  unit_price: number | string | null;
  bulk_price: number | string | null;
  units_per_bulk: number | null;
  stock_status: StockStatus;
  cart_available: boolean | null;
  pickup_cost: number | string | null;
  delivery_cost: number | string | null;
  free_delivery_threshold: number | string | null;
  other_payment_surcharge_pct: number | string | null;
  payment_conditions: string | null;
  availability_terms: string | null;
  price_change_conditional: boolean;
  checkout_confidence: number | string;
  price_signal: PriceSignal;
  executable: boolean;
  observed_at: string;
  raw_data: Record<string, unknown>;
  competitor: CompetitorSourceRow | CompetitorSourceRow[] | null;
}

interface CompetitorRunRow {
  id: string;
  status: string;
  trigger_source: string;
  started_at: string;
  finished_at: string | null;
  pages_fetched: number;
  products_parsed: number;
  products_matched: number;
  high_matches: number;
  medium_matches: number;
  low_matches: number;
  no_matches: number;
  price_changes: number;
  alerts_created: number;
  structural_signature: string | null;
  errors: string[];
}

export interface PendingCompetitorAlert {
  id: string;
  type: CompetitorAlertType;
  severity: "important" | "critical";
  differencePct?: number;
  payload: Record<string, unknown>;
}

interface PendingAlertRow {
  id: string;
  alert_type: CompetitorAlertType;
  severity: "important" | "critical";
  difference_pct: number | string | null;
  payload: Record<string, unknown>;
}

const DEFAULT_RULES: Array<{
  type: CompetitorAlertType;
  thresholdPct: number;
  cooldownHours: number;
}> = [
  { type: "lombardo_more_expensive", thresholdPct: 10, cooldownHours: 72 },
  { type: "competitor_price_change", thresholdPct: 10, cooldownHours: 24 },
  { type: "match_lost", thresholdPct: 0, cooldownHours: 168 },
];

function one<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asArray<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function sourceIdentifier(raw: Record<string, unknown> | null, keys: string[]) {
  if (!raw) return undefined;
  const candidates = [raw, ...Object.values(raw).filter((value): value is Record<string, unknown> =>
    Boolean(value) && typeof value === "object" && !Array.isArray(value))];
  for (const candidate of candidates) {
    for (const key of keys) {
      const value = candidate[key];
      if (typeof value === "string" || typeof value === "number") {
        const normalized = String(value).trim();
        if (normalized) return normalized;
      }
    }
  }
  return undefined;
}

function positiveNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function runView(row: CompetitorRunRow | undefined): CompetitorRunView | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    status: row.status,
    trigger: row.trigger_source,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    pagesFetched: row.pages_fetched,
    productsParsed: row.products_parsed,
    matched: row.products_matched,
    high: row.high_matches,
    medium: row.medium_matches,
    low: row.low_matches,
    noMatch: row.no_matches,
    priceChanges: row.price_changes,
    alertsCreated: row.alerts_created,
    circuitSignature: row.structural_signature ?? undefined,
    errors: Array.isArray(row.errors) ? row.errors : [],
  };
}

export class CompetitorStoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export class CompetitorStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantSlug: string;
  private readonly fetcher: typeof fetch;
  private tenantIdPromise: Promise<string> | null = null;

  constructor(options: StoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantSlug = options.tenantSlug;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers(prefer?: string, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...extra,
    };
    if (!this.secretKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${this.secretKey}`;
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  private request(path: string, init: RequestInit = {}, prefer?: string) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.headers(prefer), ...init.headers },
      cache: "no-store",
    });
  }

  private async rows<T>(path: string, message: string) {
    const response = await this.request(path);
    if (!response.ok) throw new CompetitorStoreError(message, response.status);
    return (await response.json()) as T[];
  }

  private async rpc<T>(name: string, body: Record<string, unknown>, message: string) {
    const response = await this.request(`rpc/${name}`, { method: "POST", body: JSON.stringify(body) });
    if (!response.ok) {
      const detail = (await response.json().catch(() => ({}))) as { message?: string };
      throw new CompetitorStoreError(detail.message ? `${message} ${detail.message}` : message, response.status);
    }
    return (await response.json()) as T;
  }

  async tenantId() {
    this.tenantIdPromise ??= (async () => {
      const search = new URLSearchParams({
        select: "id",
        slug: `eq.${this.tenantSlug}`,
        status: "eq.active",
        limit: "2",
      });
      const result = await this.rows<{ id: string }>(`tenants?${search}`, "No pudimos resolver el tenant de Competencia.");
      if (result.length !== 1) throw new CompetitorStoreError("El tenant activo no es unívoco.");
      return result[0].id;
    })().catch((error: unknown) => {
      this.tenantIdPromise = null;
      throw error;
    });
    return this.tenantIdPromise;
  }

  async ensurePositano(): Promise<CompetitorRecord> {
    const tenantId = await this.tenantId();
    const response = await this.request(
      "competitors?on_conflict=tenant_id,slug&select=id,tenant_id,slug,name,crawl_delay_ms,max_pages,circuit_state,circuit_reason",
      {
        method: "POST",
        body: JSON.stringify({
          tenant_id: tenantId,
          slug: "positano",
          name: "Positano Vinos",
          base_url: "https://www.positanovinos.com.ar",
          active: true,
          crawl_delay_ms: 750,
          max_pages: 12,
          parser_version: "positano-tiendanube-v1",
          config: { source: "public_catalog", robotsRequired: true, externalSignalsOnly: true, executableRequiresCart: true },
          priority: "high",
          price_source: "ecommerce",
          checkout_type: "full",
          source_reliable: true,
        }),
      },
      "resolution=ignore-duplicates,return=representation",
    );
    if (!response.ok) throw new CompetitorStoreError("No pudimos registrar Positano.", response.status);
    let row = ((await response.json()) as CompetitorRow[])[0];
    if (!row) {
      const search = new URLSearchParams({
        select: "id,tenant_id,slug,name,crawl_delay_ms,max_pages,circuit_state,circuit_reason",
        tenant_id: `eq.${tenantId}`,
        slug: "eq.positano",
        limit: "1",
      });
      row = (await this.rows<CompetitorRow>(`competitors?${search}`, "No pudimos cargar Positano."))[0];
    }
    if (!row) throw new CompetitorStoreError("Positano no quedó configurado.");
    await this.ensureDefaultRules(row.id, tenantId);
    return {
      id: row.id,
      tenantId: row.tenant_id,
      slug: row.slug,
      name: row.name,
      crawlDelayMs: row.crawl_delay_ms,
      maxPages: row.max_pages,
      circuitState: row.circuit_state,
      circuitReason: row.circuit_reason ?? undefined,
    };
  }

  private async ensureDefaultRules(competitorId: string, tenantId: string) {
    const response = await this.request(
      "competitor_alert_rules?on_conflict=tenant_id,competitor_id,alert_type",
      {
        method: "POST",
        body: JSON.stringify(DEFAULT_RULES.map((rule) => ({
          tenant_id: tenantId,
          competitor_id: competitorId,
          alert_type: rule.type,
          enabled: true,
          threshold_pct: rule.thresholdPct,
          cooldown_hours: rule.cooldownHours,
        }))),
      },
      "resolution=ignore-duplicates,return=minimal",
    );
    if (!response.ok) throw new CompetitorStoreError("No pudimos inicializar las alertas de competencia.", response.status);
  }

  async claim(input: {
    competitorId: string;
    runKey: string;
    trigger: "schedule" | "manual" | "pilot" | "retry";
    createdBy?: string;
  }) {
    return this.rpc<{ claimed: boolean; reason?: string; runId?: string }>(
      "lombardo_claim_competitor_run",
      {
        p_competitor_id: input.competitorId,
        p_run_key: input.runKey,
        p_trigger_source: input.trigger,
        p_created_by: input.createdBy ?? null,
      },
      "No pudimos adquirir el lock de Competencia.",
    );
  }

  async latestSuccessfulRun(competitorId: string) {
    const search = new URLSearchParams({
      select: "id,products_parsed,structural_signature,finished_at",
      competitor_id: `eq.${competitorId}`,
      status: "in.(completed,warning)",
      order: "finished_at.desc",
      limit: "1",
    });
    return (await this.rows<{
      id: string;
      products_parsed: number;
      structural_signature: string | null;
      finished_at: string;
    }>(`competitor_runs?${search}`, "No pudimos leer la corrida previa."))[0] ?? null;
  }

  async finishFailure(input: {
    runId: string;
    competitorId: string;
    status: "failed" | "blocked";
    message: string;
    summary?: Record<string, unknown>;
  }) {
    const runSearch = new URLSearchParams({ id: `eq.${input.runId}`, status: "eq.running" });
    const runResponse = await this.request(`competitor_runs?${runSearch}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: input.status,
        finished_at: new Date().toISOString(),
        errors: [input.message.slice(0, 400)],
        summary: input.summary ?? {},
        alert_status: input.status === "blocked" ? "pending" : "not_required",
      }),
    }, "return=minimal");
    if (!runResponse.ok) throw new CompetitorStoreError("No pudimos cerrar la corrida fallida.", runResponse.status);
    if (input.status === "blocked") {
      const competitorSearch = new URLSearchParams({ id: `eq.${input.competitorId}` });
      const response = await this.request(`competitors?${competitorSearch}`, {
        method: "PATCH",
        body: JSON.stringify({ circuit_state: "open", circuit_reason: input.message.slice(0, 400) }),
      }, "return=minimal");
      if (!response.ok) throw new CompetitorStoreError("No pudimos abrir el circuit breaker.", response.status);
    }
  }

  private async vinrosSupplierId() {
    const search = new URLSearchParams({
      select: "id,tenant:tenant_id!inner(slug,status)",
      code: "eq.vinros",
      active: "is.true",
      "tenant.slug": `eq.${this.tenantSlug}`,
      "tenant.status": "eq.active",
      limit: "2",
    });
    const result = await this.rows<{ id: string }>(`suppliers?${search}`, "No pudimos resolver VINROS.");
    if (result.length !== 1) throw new CompetitorStoreError("VINROS no es unívoco.");
    return result[0].id;
  }

  async loadRuniaProducts(): Promise<RuniaCompetitorProduct[]> {
    const supplierId = await this.vinrosSupplierId();
    const search = new URLSearchParams({
      select: "id,supplier_sku,name_raw,presentation_raw,normalized_presentation,source_raw,retail_prices:supplier_prices!inner(price_type,current_price),editorial:supplier_product_editorial(brand_name,category_slug)",
      supplier_id: `eq.${supplierId}`,
      active: "is.true",
      eligibility_status: "eq.safe",
      order: "id.asc",
    });
    const rows: RuniaRow[] = [];
    const pageSize = 750;
    for (let offset = 0; ; offset += pageSize) {
      const response = await this.request(`supplier_products?${search}`, {
        headers: { Range: `${offset}-${offset + pageSize - 1}` },
      });
      if (!response.ok) throw new CompetitorStoreError("No pudimos cargar el catálogo SAFE para matching.", response.status);
      const batch = (await response.json()) as RuniaRow[];
      rows.push(...batch);
      if (batch.length < pageSize) break;
    }
    return rows.flatMap((row) => {
      const retail = Number(asArray(row.retail_prices).find((price) => price.price_type === "retail")?.current_price);
      const cost = positiveNumber(
        asArray(row.retail_prices).find((price) => price.price_type === "cost")?.current_price,
      );
      if (!Number.isFinite(retail) || retail <= 0) return [];
      const editorial = one(row.editorial);
      return [{
        id: row.id,
        sku: row.supplier_sku,
        name: row.name_raw,
        presentation: row.normalized_presentation || row.presentation_raw || "Unidad",
        brand: editorial?.brand_name || row.name_raw.trim().split(/\s+/)[0],
        category: editorial?.category_slug || categoryForSupplierSku(row.supplier_sku).slug,
        ean: sourceIdentifier(row.source_raw, ["ean", "ean13", "barcode", "codigo_barras", "código_barras"]),
        retailPrice: retail,
        costPrice: cost,
      }];
    });
  }

  async ingest(input: {
    runId: string;
    structuralSignature: string;
    pagesFetched: number;
    productsSeen: number;
    products: Array<{ product: ExternalCompetitorProduct; match: CompetitorMatchDecision }>;
  }) {
    return this.rpc<{
      parsed: number;
      matched: number;
      high: number;
      medium: number;
      low: number;
      noMatch: number;
      priceChanges: number;
      alertsCreated: number;
    }>("lombardo_ingest_competitor_snapshot", {
      p_run_id: input.runId,
      p_structural_signature: input.structuralSignature,
      p_pages_fetched: input.pagesFetched,
      p_products_seen: input.productsSeen,
      p_products: input.products.map(({ product, match }) => ({
        ...product,
        normalizedName: normalizeImageMatchText(`${product.externalName} ${product.presentation ?? ""}`),
        volumeMl: volumeMl(`${product.externalName} ${product.presentation ?? ""}`) ?? undefined,
        match,
      })),
    }, "No pudimos guardar el snapshot competitivo.");
  }

  async pendingAlerts(runId: string) {
    const search = new URLSearchParams({
      select: "id,alert_type,severity,difference_pct,payload",
      run_id: `eq.${runId}`,
      status: "eq.pending",
      order: "severity.desc,difference_pct.desc.nullslast,created_at.asc",
      limit: "1000",
    });
    const rows = await this.rows<PendingAlertRow>(
      `competitor_alert_events?${search}`,
      "No pudimos cargar las alertas competitivas.",
    );
    return rows.map((row): PendingCompetitorAlert => ({
      id: row.id,
      type: row.alert_type,
      severity: row.severity,
      differencePct: row.difference_pct === null ? undefined : Number(row.difference_pct),
      payload: row.payload ?? {},
    }));
  }

  async recordAlertDelivery(runId: string, eventIds: string[], input: {
    status: "sent" | "failed" | "suppressed";
    messageId?: string;
    error?: string;
  }) {
    if (eventIds.length) {
      const eventSearch = new URLSearchParams({ id: `in.(${eventIds.join(",")})`, status: "eq.pending" });
      const response = await this.request(`competitor_alert_events?${eventSearch}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: input.status,
          provider_message_id: input.messageId ?? null,
          error_summary: input.error?.slice(0, 300) ?? null,
          sent_at: input.status === "sent" ? new Date().toISOString() : null,
        }),
      }, "return=minimal");
      if (!response.ok) throw new CompetitorStoreError("No pudimos auditar los eventos de alerta.", response.status);
    }
    const runSearch = new URLSearchParams({ id: `eq.${runId}` });
    const runResponse = await this.request(`competitor_runs?${runSearch}`, {
      method: "PATCH",
      body: JSON.stringify({
        alert_status: input.status,
        alert_provider_message_id: input.messageId ?? null,
        alert_error_summary: input.error?.slice(0, 300) ?? null,
        alert_sent_at: input.status === "sent" ? new Date().toISOString() : null,
      }),
    }, "return=minimal");
    if (!runResponse.ok) throw new CompetitorStoreError("No pudimos auditar la alerta de corrida.", runResponse.status);
  }

  async listRules(competitorId: string): Promise<CompetitorAlertRule[]> {
    const search = new URLSearchParams({
      select: "id,alert_type,enabled,threshold_pct,cooldown_hours",
      competitor_id: `eq.${competitorId}`,
      order: "alert_type.asc",
    });
    const rows = await this.rows<AlertRow>(`competitor_alert_rules?${search}`, "No pudimos cargar las reglas de alerta.");
    return rows.map((row) => ({
      id: row.id,
      type: row.alert_type,
      enabled: row.enabled,
      thresholdPct: Number(row.threshold_pct),
      cooldownHours: row.cooldown_hours,
    }));
  }

  async updateRules(competitorId: string, rules: Array<{
    type: CompetitorAlertType;
    enabled: boolean;
    thresholdPct: number;
    cooldownHours: number;
  }>) {
    const tenantId = await this.tenantId();
    for (const rule of rules) {
      const search = new URLSearchParams({
        tenant_id: `eq.${tenantId}`,
        competitor_id: `eq.${competitorId}`,
        alert_type: `eq.${rule.type}`,
      });
      const response = await this.request(`competitor_alert_rules?${search}`, {
        method: "PATCH",
        body: JSON.stringify({
          enabled: rule.enabled,
          threshold_pct: rule.thresholdPct,
          cooldown_hours: rule.cooldownHours,
        }),
      }, "return=minimal");
      if (!response.ok) throw new CompetitorStoreError("No pudimos actualizar las alertas.", response.status);
    }
  }

  private mapComparison(row: ComparisonProductRow): CompetitorComparisonRow {
    const match = one(row.match);
    const runia = one(match?.runia);
    const editorial = one(runia?.editorial);
    const currentPrice = positiveNumber(row.current_price);
    const lombardoRetailPrice = positiveNumber(
      asArray(runia?.lombardo_prices).find((price) => price.price_type === "retail" && price.active)?.current_price,
    ) ?? positiveNumber(
      asArray(runia?.retail_prices).find((price) => price.price_type === "retail")?.current_price,
    );
    const difference = currentPrice && lombardoRetailPrice
      ? priceDifference(lombardoRetailPrice, currentPrice)
      : {};
    return {
      id: row.id,
      externalName: row.external_name,
      externalProductUrl: row.external_product_url,
      brand: row.brand || editorial?.brand_name || "Sin marca",
      category: editorial?.category_slug || (runia ? categoryForSupplierSku(runia.supplier_sku).slug : "sin-categoria"),
      currentPrice,
      listPrice: positiveNumber(row.list_price),
      promotionText: row.promotion_text ?? undefined,
      fetchedAt: row.fetched_at,
      available: row.available,
      runiaProductId: match?.runia_product_id ?? undefined,
      runiaSku: runia?.supplier_sku,
      runiaName: runia?.name_raw,
      lombardoRetailPrice,
      vinrosCost: positiveNumber(
        asArray(runia?.retail_prices).find((price) => price.price_type === "cost")?.current_price,
      ),
      confidence: Number(match?.match_confidence ?? 0),
      confidenceBand: match?.confidence_band ?? "none",
      matchMethod: match?.match_method ?? "none",
      manualOverride: match?.manual_override ?? false,
      suggestedRuniaProductId: match?.suggested_runia_product_id ?? undefined,
      matchedFields: Array.isArray(match?.matched_fields) ? match.matched_fields : [],
      conflicts: Array.isArray(match?.conflicts) ? match.conflicts : [],
      differenceAmount: difference.amount,
      differencePct: difference.percentage,
    };
  }

  private async comparisonRows(competitorId: string) {
    const search = new URLSearchParams({
      select: "id,external_name,external_product_url,brand,current_price,list_price,promotion_text,fetched_at,available,match:competitor_product_matches(runia_product_id,suggested_runia_product_id,match_confidence,confidence_band,match_method,manual_override,matched_fields,conflicts,runia:runia_product_id(id,supplier_sku,name_raw,retail_prices:supplier_prices(price_type,current_price),lombardo_prices:lombardo_selling_prices(price_type,current_price,active),editorial:supplier_product_editorial(brand_name,category_slug)))",
      competitor_id: `eq.${competitorId}`,
      order: "available.desc,external_name.asc",
      limit: "1000",
    });
    return (await this.rows<ComparisonProductRow>(
      `competitor_products?${search}`,
      "No pudimos cargar las comparaciones.",
    )).map((row) => this.mapComparison(row));
  }

  private async latestRun(competitorId: string) {
    const search = new URLSearchParams({
      select: "id,status,trigger_source,started_at,finished_at,pages_fetched,products_parsed,products_matched,high_matches,medium_matches,low_matches,no_matches,price_changes,alerts_created,structural_signature,errors",
      competitor_id: `eq.${competitorId}`,
      order: "started_at.desc",
      limit: "1",
    });
    return runView((await this.rows<CompetitorRunRow>(
      `competitor_runs?${search}`,
      "No pudimos cargar la última corrida.",
    ))[0]);
  }

  async dashboard(filters: CompetitorDashboardFilters = {}): Promise<CompetitorDashboard> {
    const competitor = await this.ensurePositano();
    const [allRows, latestRun, rules] = await Promise.all([
      this.comparisonRows(competitor.id),
      this.latestRun(competitor.id),
      this.listRules(competitor.id),
    ]);
    const brand = filters.brand?.trim().toLocaleLowerCase("es-AR");
    const category = filters.category?.trim().toLocaleLowerCase("es-AR");
    const rows = allRows.filter((row) => {
      if (brand && row.brand.toLocaleLowerCase("es-AR") !== brand) return false;
      if (category && row.category.toLocaleLowerCase("es-AR") !== category) return false;
      if (filters.confidence && row.confidenceBand !== filters.confidence) return false;
      if (filters.minimumDifferencePct !== undefined &&
        (row.differencePct === undefined || row.differencePct < filters.minimumDifferencePct)) return false;
      if (filters.maximumDifferencePct !== undefined &&
        (row.differencePct === undefined || row.differencePct > filters.maximumDifferencePct)) return false;
      return true;
    }).sort((left, right) =>
      Math.abs(right.differencePct ?? 0) - Math.abs(left.differencePct ?? 0));
    const comparable = allRows.filter((row) => row.differencePct !== undefined);
    return {
      competitor: {
        id: competitor.id,
        name: competitor.name,
        circuitState: competitor.circuitState,
        circuitReason: competitor.circuitReason,
      },
      latestRun,
      rules,
      rows: rows.slice(0, 300),
      allRows,
      brands: [...new Set(allRows.map((row) => row.brand))].sort((a, b) => a.localeCompare(b, "es")),
      categories: [...new Set(allRows.map((row) => row.category))].sort((a, b) => a.localeCompare(b, "es")),
      metrics: {
        total: allRows.filter((row) => row.available).length,
        matched: allRows.filter((row) => row.runiaProductId).length,
        high: allRows.filter((row) => row.confidenceBand === "high").length,
        medium: allRows.filter((row) => row.confidenceBand === "medium").length,
        low: allRows.filter((row) => row.confidenceBand === "low").length,
        noMatch: allRows.filter((row) => row.confidenceBand === "none").length,
        lombardoCheaper: comparable.filter((row) => (row.differencePct ?? 0) < -0.5).length,
        equal: comparable.filter((row) => Math.abs(row.differencePct ?? 0) <= 0.5).length,
        lombardoMoreExpensive: comparable.filter((row) => (row.differencePct ?? 0) > 0.5).length,
        recentChanges: latestRun?.priceChanges ?? 0,
      },
    };
  }

  private async activeCompetitorSources() {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "slug,name,priority,price_source,checkout_type,active",
      tenant_id: `eq.${tenantId}`,
      slug: "in.(positano,vinoteca-campos,al-vino-vino,vinos-rosario,rosario-vinos-exclusivos)",
      order: "name.asc",
    });
    return this.rows<CompetitorSourceRow>(
      `competitors?${search}`,
      "No pudimos cargar las fuentes competitivas activas.",
    );
  }

  private async commercialObservations() {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,product_key,external_name,source_url,list_price,promotional_price,transfer_price,transfer_discount_pct,unit_price,bulk_price,units_per_bulk,stock_status,cart_available,pickup_cost,delivery_cost,free_delivery_threshold,other_payment_surcharge_pct,payment_conditions,availability_terms,price_change_conditional,checkout_confidence,price_signal,executable,observed_at,raw_data,competitor:competitor_id!inner(slug,name,priority,price_source,checkout_type,active)",
      tenant_id: `eq.${tenantId}`,
      "competitor.active": "is.true",
      order: "observed_at.desc",
      limit: "1000",
    });
    const rows = await this.rows<MarketObservationRow>(
      `competitor_market_observations?${search}`,
      "No pudimos cargar las observaciones comerciales.",
    );
    return rows.flatMap((row): CompetitorCommercialObservation[] => {
      const competitor = one(row.competitor);
      if (!competitor) return [];
      const note = typeof row.raw_data?.deliveryBasketSubtotal === "number"
        ? `Flete observado con canasta de $${row.raw_data.deliveryBasketSubtotal.toLocaleString("es-AR")}; no extrapolado.`
        : undefined;
      return [{
        id: row.id,
        competitorSlug: competitor.slug,
        competitorName: competitor.name,
        productKey: row.product_key,
        externalName: row.external_name,
        sourceUrl: row.source_url ?? undefined,
        priceSource: competitor.price_source,
        listPrice: positiveNumber(row.list_price),
        promotionalPrice: positiveNumber(row.promotional_price),
        transferPrice: positiveNumber(row.transfer_price),
        transferDiscountPct: positiveNumber(row.transfer_discount_pct),
        unitPrice: positiveNumber(row.unit_price),
        bulkPrice: positiveNumber(row.bulk_price),
        unitsPerBulk: row.units_per_bulk ?? undefined,
        stockStatus: row.stock_status,
        cartAvailable: row.cart_available ?? undefined,
        pickupCost: row.pickup_cost === null ? undefined : Number(row.pickup_cost),
        deliveryCost: row.delivery_cost === null ? undefined : Number(row.delivery_cost),
        freeDeliveryThreshold: positiveNumber(row.free_delivery_threshold),
        otherPaymentSurchargePct: positiveNumber(row.other_payment_surcharge_pct),
        paymentConditions: row.payment_conditions ?? undefined,
        availabilityTerms: row.availability_terms ?? undefined,
        priceChangeConditional: row.price_change_conditional,
        checkoutType: competitor.checkout_type,
        checkoutConfidence: Number(row.checkout_confidence),
        priceSignal: row.price_signal,
        executable: row.executable,
        observedAt: row.observed_at,
        note,
      }];
    });
  }

  async multiCompetitorDashboard(): Promise<MultiCompetitorDashboard> {
    const positano = await this.ensurePositano();
    const [positanoRows, observations, sources, runiaProducts] = await Promise.all([
      this.comparisonRows(positano.id),
      this.commercialObservations(),
      this.activeCompetitorSources(),
      this.loadRuniaProducts(),
    ]);
    const deliveryMode = process.env.DELIVERY_COST_MODE?.trim();
    const configuredDelivery = Number(process.env.DELIVERY_FLAT_RATE);
    const lombardoDeliveryCost = deliveryMode === "FREE"
      ? 0
      : deliveryMode === "FLAT_RATE" && Number.isFinite(configuredDelivery) && configuredDelivery >= 0
        ? configuredDelivery
        : undefined;
    const topTen = TOP_TEN_COMPETITOR_PRODUCTS.map((definition) => {
      const runiaProduct = runiaProducts.find((product) =>
        productMatchesTopTen(definition.key, `${product.name} ${product.presentation}`));
      const positanoRow = positanoRows
        .filter((row) => row.runiaProductId === runiaProduct?.id ||
          productMatchesTopTen(definition.key, `${row.runiaName ?? ""} ${row.externalName}`))
        .sort((left, right) => right.confidence - left.confidence)[0];
      const competitors: Partial<Record<ActiveCompetitorSlug, CompetitorCommercialObservation>> = {};
      for (const observation of observations) {
        if (observation.productKey === definition.key && !competitors[observation.competitorSlug]) {
          competitors[observation.competitorSlug] = observation;
        }
      }
      if (!competitors.positano && positanoRow) {
        competitors.positano = {
          id: positanoRow.id,
          competitorSlug: "positano",
          competitorName: "Positano Vinos",
          productKey: definition.key,
          externalName: positanoRow.externalName,
          sourceUrl: positanoRow.externalProductUrl,
          priceSource: "ecommerce",
          listPrice: positanoRow.listPrice,
          promotionalPrice: positanoRow.listPrice ? positanoRow.currentPrice : undefined,
          unitPrice: positanoRow.listPrice ? undefined : positanoRow.currentPrice,
          stockStatus: positanoRow.available ? "in_stock" : "out_of_stock",
          priceChangeConditional: false,
          checkoutType: "full",
          checkoutConfidence: positanoRow.available ? 0.65 : 0,
          priceSignal: positanoRow.available && positanoRow.currentPrice ? "medium" : "invalid",
          executable: false,
          observedAt: positanoRow.fetchedAt,
          paymentConditions: "Catálogo automático; carrito no auditado para este SKU.",
        };
      }
      const matrix = buildScenarioMatrix({
        lombardoPrice: runiaProduct?.retailPrice ?? positanoRow?.lombardoRetailPrice,
        lombardoPickupCost: 0,
        lombardoDeliveryCost,
        observations: competitors,
      });
      return {
        productKey: definition.key,
        productName: definition.label,
        runiaProductId: runiaProduct?.id ?? positanoRow?.runiaProductId,
        runiaSku: runiaProduct?.sku ?? positanoRow?.runiaSku,
        vinrosCost: runiaProduct?.costPrice ?? positanoRow?.vinrosCost,
        lombardoPrice: runiaProduct?.retailPrice ?? positanoRow?.lombardoRetailPrice,
        competitors,
        scenarioPrices: matrix.scenarioPrices,
        conclusions: matrix.conclusions,
        recommendation: pricingRecommendation({
          lombardoPrice: runiaProduct?.retailPrice ?? positanoRow?.lombardoRetailPrice,
          vinrosCost: runiaProduct?.costPrice ?? positanoRow?.vinrosCost,
          conclusion: matrix.conclusions.product_price,
        }),
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      sources: sources.map((source) => ({
        slug: source.slug,
        name: source.name,
        priority: source.priority,
        priceSource: source.price_source,
        checkoutType: source.checkout_type,
        active: source.active,
      })),
      topTen,
    };
  }

  async productDetail(productId: string): Promise<CompetitorProductDetail | null> {
    const competitor = await this.ensurePositano();
    const search = new URLSearchParams({
      select: "id,external_name,external_product_url,brand,current_price,list_price,promotion_text,fetched_at,available,match:competitor_product_matches(runia_product_id,suggested_runia_product_id,match_confidence,confidence_band,match_method,manual_override,matched_fields,conflicts,runia:runia_product_id(id,supplier_sku,name_raw,retail_prices:supplier_prices(price_type,current_price),lombardo_prices:lombardo_selling_prices(price_type,current_price,active),editorial:supplier_product_editorial(brand_name,category_slug)))",
      id: `eq.${productId}`,
      competitor_id: `eq.${competitor.id}`,
      limit: "1",
    });
    const product = (await this.rows<ComparisonProductRow>(
      `competitor_products?${search}`,
      "No pudimos cargar el producto competitivo.",
    ))[0];
    if (!product) return null;
    const historySearch = new URLSearchParams({
      select: "id,current_price,list_price,promotion_text,fetched_at",
      competitor_product_id: `eq.${productId}`,
      order: "fetched_at.desc",
      limit: "90",
    });
    const matchHistorySearch = new URLSearchParams({
      select: "id,previous_runia_product_id,runia_product_id,previous_confidence,match_confidence,previous_band,confidence_band,match_method,reason,changed_at",
      competitor_product_id: `eq.${productId}`,
      order: "changed_at.desc",
      limit: "50",
    });
    const [history, matchHistory] = await Promise.all([
      this.rows<{
        id: string | number;
        current_price: number | string | null;
        list_price: number | string | null;
        promotion_text: string | null;
        fetched_at: string;
      }>(`competitor_price_history?${historySearch}`, "No pudimos cargar el historial de precios."),
      this.rows<{
        id: string | number;
        previous_runia_product_id: string | null;
        runia_product_id: string | null;
        previous_confidence: number | string | null;
        match_confidence: number | string;
        previous_band: string | null;
        confidence_band: string;
        match_method: string;
        reason: string;
        changed_at: string;
      }>(`competitor_match_history?${matchHistorySearch}`, "No pudimos cargar el historial de matching."),
    ]);
    return {
      row: this.mapComparison(product),
      history: history.map((point) => ({
        id: String(point.id),
        fetchedAt: point.fetched_at,
        currentPrice: positiveNumber(point.current_price),
        listPrice: positiveNumber(point.list_price),
        promotionText: point.promotion_text ?? undefined,
      })),
      matchHistory: matchHistory.map((point) => ({
        id: String(point.id),
        changedAt: point.changed_at,
        previousRuniaProductId: point.previous_runia_product_id ?? undefined,
        runiaProductId: point.runia_product_id ?? undefined,
        previousConfidence: point.previous_confidence === null ? undefined : Number(point.previous_confidence),
        confidence: Number(point.match_confidence),
        previousBand: point.previous_band ?? undefined,
        band: point.confidence_band,
        method: point.match_method,
        reason: point.reason,
      })),
    };
  }

  async setManualMatch(input: {
    competitorProductId: string;
    runiaSku?: string;
    rejected: boolean;
    operatorId: string;
  }) {
    let runiaProductId: string | null = null;
    if (!input.rejected) {
      const supplierId = await this.vinrosSupplierId();
      const search = new URLSearchParams({
        select: "id",
        supplier_id: `eq.${supplierId}`,
        supplier_sku: `eq.${input.runiaSku ?? ""}`,
        active: "is.true",
        eligibility_status: "eq.safe",
        limit: "2",
      });
      const products = await this.rows<{ id: string }>(
        `supplier_products?${search}`,
        "No pudimos validar el SKU Runia.",
      );
      if (products.length !== 1) throw new CompetitorStoreError("El SKU debe identificar un único producto SAFE.", 422);
      runiaProductId = products[0].id;
    }
    await this.rpc<void>("lombardo_set_competitor_manual_match", {
      p_tenant_id: await this.tenantId(),
      p_competitor_product_id: input.competitorProductId,
      p_runia_product_id: runiaProductId,
      p_rejected: input.rejected,
      p_operator_id: input.operatorId,
    }, "No pudimos guardar la corrección manual.");
  }
}
