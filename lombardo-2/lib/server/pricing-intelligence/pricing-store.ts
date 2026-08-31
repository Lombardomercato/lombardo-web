import "server-only";

import {
  buildPricingOpportunity,
} from "@/lib/pricing-intelligence/engine";
import type {
  CommercialSensitivity,
  PricingIntelligenceSettings,
  PricingOpportunityInput,
} from "@/lib/pricing-intelligence/types";

interface StoreOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

interface PricingSettingsRow {
  very_competitive_max_pct: number | string;
  competitive_max_pct: number | string;
  market_max_pct: number | string;
  expensive_max_pct: number | string;
  minimum_margin_pct: number | string;
  target_margin_pct: number | string;
  competitor_max_age_hours: number;
}

interface PricingOpportunityRow {
  competitor_product_id: string;
  competitor_name: string;
  external_name: string;
  external_product_url: string;
  competitor_price: number | string;
  competitor_fetched_at: string;
  competitor_price_changed_at: string | null;
  runia_product_id: string;
  runia_sku: string;
  runia_name: string;
  eligibility_status: string;
  category_slug: string;
  match_confidence: number | string;
  confidence_band: string;
  supplier_cost: number | string | null;
  supplier_retail: number | string;
  lombardo_selling_price: number | string;
  selling_price_source: "SUPPLIER_RETAIL_FALLBACK" | "LOMBARDO_SELLING_PRICE";
  selling_price_version: number | string;
  vinros_changed_at: string | null;
  commercial_sensitivity: CommercialSensitivity;
  classification_source: "manual" | "rule";
  decision_status: "pending" | "ignored" | "applied";
}

interface SellingPriceHistoryRow {
  id: number | string;
  old_price: number | string;
  new_price: number | string;
  reason: "MANUAL" | "COMPETITOR_REVIEW" | "PROMOTION" | "OTHER";
  source: "ADMIN" | "PRICING_INTELLIGENCE";
  approved_by: string;
  changed_at: string;
}

const DATABASE_MESSAGES: Record<string, string> = {
  SELLING_PRICE_MUST_BE_POSITIVE: "El precio Lombardo debe ser mayor a cero.",
  INVALID_SELLING_PRICE_REASON: "El motivo del cambio no es válido.",
  INVALID_SELLING_PRICE_SOURCE: "La fuente del cambio no es válida.",
  PRODUCT_NOT_FOUND: "El producto no pertenece a Lombardo.",
  PRODUCT_NOT_SAFE_FOR_SELLING_PRICE: "El producto está BLOCKED, PENDING o COST_ONLY.",
  SUPPLIER_RETAIL_REQUIRED: "VINROS no tiene retail vigente para este producto.",
  SUPPLIER_COST_REQUIRED: "VINROS no tiene costo vigente; no se puede aprobar el precio.",
  SUPPLIER_COST_CHANGED_REVIEW_AGAIN: "El costo VINROS cambió. Revisá nuevamente la oportunidad.",
  SELLING_PRICE_CHANGED_REVIEW_AGAIN: "El precio Lombardo cambió en otra sesión. Revisá nuevamente.",
  PRICING_SETTINGS_REQUIRED: "Falta configurar Pricing Intelligence.",
  COMPETITOR_PRICE_CHANGED_REVIEW_AGAIN: "El precio o match del competidor cambió. Revisá nuevamente.",
  COMPETITOR_PRICE_TOO_OLD: "El dato del competidor es demasiado antiguo. Actualizá Competencia.",
  PRICE_AT_OR_BELOW_COST_BLOCKED: "El precio igual o menor al costo está bloqueado.",
  MINIMUM_MARGIN_GUARDRAIL: "El precio queda debajo del margen mínimo configurado.",
  INVALID_COMMERCIAL_SENSITIVITY: "La sensibilidad comercial no es válida.",
  PRICING_OPPORTUNITY_NOT_FOUND: "La oportunidad ya no está disponible.",
};

function positiveNumber(value: number | string | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function errorMessage(payload: { message?: string }, fallback: string) {
  if (!payload.message) return fallback;
  return DATABASE_MESSAGES[payload.message] ?? fallback;
}

export class PricingIntelligenceStoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export class PricingIntelligenceStore {
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

  private async rows<T>(path: string, message: string) {
    const response = await this.fetcher(`${this.url}/rest/v1/${path}`, {
      headers: this.headers(),
      cache: "no-store",
    });
    if (!response.ok) throw new PricingIntelligenceStoreError(message, response.status);
    return (await response.json()) as T[];
  }

  private async rpc<T>(name: string, body: Record<string, unknown>, fallback: string) {
    const response = await this.fetcher(`${this.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as { message?: string };
      throw new PricingIntelligenceStoreError(errorMessage(payload, fallback), response.status);
    }
    if (response.status === 204) return undefined as T;
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
      const tenants = await this.rows<{ id: string }>(
        `tenants?${search}`,
        "No pudimos resolver el tenant de Pricing Intelligence.",
      );
      if (tenants.length !== 1) {
        throw new PricingIntelligenceStoreError("El tenant activo no es unívoco.");
      }
      return tenants[0].id;
    })().catch((error: unknown) => {
      this.tenantIdPromise = null;
      throw error;
    });
    return this.tenantIdPromise;
  }

  async competitorId(slug = "positano") {
    const search = new URLSearchParams({
      select: "id",
      tenant_id: `eq.${await this.tenantId()}`,
      slug: `eq.${slug}`,
      active: "is.true",
      limit: "2",
    });
    const competitors = await this.rows<{ id: string }>(
      `competitors?${search}`,
      "No pudimos resolver el competidor.",
    );
    if (competitors.length !== 1) {
      throw new PricingIntelligenceStoreError("El competidor activo no es unívoco.");
    }
    return competitors[0].id;
  }

  async settings(): Promise<PricingIntelligenceSettings> {
    const search = new URLSearchParams({
      select: "very_competitive_max_pct,competitive_max_pct,market_max_pct,expensive_max_pct,minimum_margin_pct,target_margin_pct,competitor_max_age_hours",
      tenant_id: `eq.${await this.tenantId()}`,
      limit: "1",
    });
    const row = (await this.rows<PricingSettingsRow>(
      `pricing_intelligence_settings?${search}`,
      "No pudimos cargar la configuración comercial.",
    ))[0];
    if (!row) throw new PricingIntelligenceStoreError("Falta configurar Pricing Intelligence.");
    return {
      veryCompetitiveMaxPct: Number(row.very_competitive_max_pct),
      competitiveMaxPct: Number(row.competitive_max_pct),
      marketMaxPct: Number(row.market_max_pct),
      expensiveMaxPct: Number(row.expensive_max_pct),
      minimumMarginPct: Number(row.minimum_margin_pct),
      targetMarginPct: Number(row.target_margin_pct),
      competitorMaxAgeHours: row.competitor_max_age_hours,
    };
  }

  private mapOpportunity(row: PricingOpportunityRow): PricingOpportunityInput {
    const competitorPrice = positiveNumber(row.competitor_price);
    const supplierRetail = positiveNumber(row.supplier_retail);
    const lombardoSellingPrice = positiveNumber(row.lombardo_selling_price);
    if (!competitorPrice || !supplierRetail || !lombardoSellingPrice) {
      throw new PricingIntelligenceStoreError("La comparación contiene precios inválidos.");
    }
    return {
      competitorProductId: row.competitor_product_id,
      competitorName: row.competitor_name,
      externalName: row.external_name,
      externalProductUrl: row.external_product_url,
      competitorPrice,
      competitorFetchedAt: row.competitor_fetched_at,
      competitorPriceChangedAt: row.competitor_price_changed_at ?? undefined,
      runiaProductId: row.runia_product_id,
      runiaSku: row.runia_sku,
      runiaName: row.runia_name,
      eligibilityStatus: row.eligibility_status,
      category: row.category_slug,
      matchConfidence: Number(row.match_confidence),
      confidenceBand: row.confidence_band,
      supplierCost: positiveNumber(row.supplier_cost),
      supplierRetail,
      lombardoSellingPrice,
      sellingPriceSource: row.selling_price_source,
      sellingPriceVersion: Number(row.selling_price_version),
      vinrosChangedAt: row.vinros_changed_at ?? undefined,
      commercialSensitivity: row.commercial_sensitivity,
      classificationSource: row.classification_source,
      decisionStatus: row.decision_status,
    };
  }

  async opportunities(competitorSlug = "positano") {
    const [tenantId, competitorId, settings] = await Promise.all([
      this.tenantId(),
      this.competitorId(competitorSlug),
      this.settings(),
    ]);
    const rows = await this.rpc<PricingOpportunityRow[]>(
      "lombardo_pricing_opportunities",
      { p_tenant_id: tenantId, p_competitor_id: competitorId },
      "No pudimos calcular las oportunidades de precio.",
    );
    const opportunities = rows
      .map((row) => buildPricingOpportunity(this.mapOpportunity(row), settings))
      .sort((left, right) => right.impactScore - left.impactScore || right.differencePct - left.differencePct);
    return { settings, opportunities };
  }

  async sellingPriceHistory(productId: string) {
    const search = new URLSearchParams({
      select: "id,old_price,new_price,reason,source,approved_by,changed_at",
      tenant_id: `eq.${await this.tenantId()}`,
      supplier_product_id: `eq.${productId}`,
      order: "changed_at.desc",
      limit: "100",
    });
    const rows = await this.rows<SellingPriceHistoryRow>(
      `lombardo_selling_price_history?${search}`,
      "No pudimos cargar el historial Lombardo.",
    );
    return rows.map((row) => ({
      id: String(row.id),
      oldPrice: Number(row.old_price),
      newPrice: Number(row.new_price),
      reason: row.reason,
      source: row.source,
      approvedBy: row.approved_by,
      changedAt: row.changed_at,
    }));
  }

  async setSensitivity(productId: string, sensitivity: CommercialSensitivity, operatorId: string) {
    await this.rpc<void>("lombardo_set_commercial_sensitivity", {
      p_tenant_id: await this.tenantId(),
      p_supplier_product_id: productId,
      p_sensitivity: sensitivity,
      p_operator_id: operatorId,
    }, "No pudimos actualizar la sensibilidad comercial.");
  }

  async updateSettings(settings: PricingIntelligenceSettings, operatorId: string) {
    await this.rpc<void>("lombardo_update_pricing_settings", {
      p_tenant_id: await this.tenantId(),
      p_very_competitive_max_pct: settings.veryCompetitiveMaxPct,
      p_competitive_max_pct: settings.competitiveMaxPct,
      p_market_max_pct: settings.marketMaxPct,
      p_expensive_max_pct: settings.expensiveMaxPct,
      p_minimum_margin_pct: settings.minimumMarginPct,
      p_target_margin_pct: settings.targetMarginPct,
      p_competitor_max_age_hours: settings.competitorMaxAgeHours,
      p_operator_id: operatorId,
    }, "No pudimos actualizar la configuración comercial.");
  }

  async ignoreOpportunity(competitorProductId: string, operatorId: string, note?: string) {
    await this.rpc<void>("lombardo_ignore_pricing_opportunity", {
      p_tenant_id: await this.tenantId(),
      p_competitor_product_id: competitorProductId,
      p_operator_id: operatorId,
      p_note: note ?? null,
    }, "No pudimos ignorar la oportunidad.");
  }

  async setSellingPrice(input: {
    productId: string;
    newPrice: number;
    reason: "MANUAL" | "COMPETITOR_REVIEW" | "PROMOTION" | "OTHER";
    source: "ADMIN" | "PRICING_INTELLIGENCE";
    approvedBy: string;
    expectedCurrentPrice: number;
    expectedVersion: number;
    expectedSupplierCost: number;
    expectedCompetitorProductId: string;
    expectedCompetitorPrice: number;
    expectedCompetitorFetchedAt: string;
    allowAtOrBelowCost: boolean;
  }) {
    return this.rpc<{ changed: boolean; price: number; version: number }>(
      "lombardo_set_selling_price",
      {
        p_tenant_id: await this.tenantId(),
        p_supplier_product_id: input.productId,
        p_new_price: input.newPrice,
        p_reason: input.reason,
        p_source: input.source,
        p_approved_by: input.approvedBy,
        p_expected_current_price: input.expectedCurrentPrice,
        p_expected_version: input.expectedVersion,
        p_expected_supplier_cost: input.expectedSupplierCost,
        p_expected_competitor_product_id: input.expectedCompetitorProductId,
        p_expected_competitor_price: input.expectedCompetitorPrice,
        p_expected_competitor_fetched_at: input.expectedCompetitorFetchedAt,
        p_allow_at_or_below_cost: input.allowAtOrBelowCost,
      },
      "No pudimos aplicar el precio Lombardo.",
    );
  }
}
