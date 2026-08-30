import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPricingOpportunity,
  calculateMargin,
  calculateScenarios,
  classifyPricePosition,
} from "../lib/pricing-intelligence/engine.ts";
import type {
  PricingIntelligenceSettings,
  PricingOpportunityInput,
} from "../lib/pricing-intelligence/types.ts";

const settings: PricingIntelligenceSettings = {
  veryCompetitiveMaxPct: -10,
  competitiveMaxPct: -3,
  marketMaxPct: 3,
  expensiveMaxPct: 10,
  minimumMarginPct: 20,
  targetMarginPct: 30,
  competitorMaxAgeHours: 48,
};

const opportunity: PricingOpportunityInput = {
  competitorProductId: "11111111-1111-4111-8111-111111111111",
  competitorName: "Positano Vinos",
  externalName: "VINO TEST X 750 CC",
  externalProductUrl: "https://example.com/productos/vino-test",
  competitorPrice: 10_000,
  competitorFetchedAt: "2026-08-30T15:00:00.000Z",
  runiaProductId: "22222222-2222-4222-8222-222222222222",
  runiaSku: "VIN001",
  runiaName: "VINO TEST x 750cc",
  eligibilityStatus: "safe",
  category: "vinos",
  matchConfidence: 1,
  confidenceBand: "high",
  supplierCost: 9_000,
  supplierRetail: 14_000,
  lombardoSellingPrice: 14_000,
  sellingPriceSource: "SUPPLIER_RETAIL_FALLBACK",
  sellingPriceVersion: 0,
  vinrosChangedAt: "2026-08-30T12:00:00.000Z",
  commercialSensitivity: "known_comparable",
  classificationSource: "rule",
  decisionStatus: "pending",
};

test("margen y markup se calculan sobre costo real y nunca se inventan", () => {
  assert.deepEqual(calculateMargin(20_000, 12_000), {
    amount: 8_000,
    percentage: 40,
    markupPercentage: 66.67,
  });
  assert.equal(calculateMargin(20_000, undefined), undefined);
});

test("price position respeta los umbrales configurables", () => {
  assert.equal(classifyPricePosition(-10, settings), "very_competitive");
  assert.equal(classifyPricePosition(-5, settings), "competitive");
  assert.equal(classifyPricePosition(2, settings), "in_market");
  assert.equal(classifyPricePosition(8, settings), "expensive");
  assert.equal(classifyPricePosition(11, settings), "very_expensive");
});

test("escenarios debajo del piso se muestran como cálculo bloqueado", () => {
  const scenarios = calculateScenarios(10_000, 9_000, "known_comparable", settings);
  const match = scenarios.find((scenario) => scenario.type === "match_competitor");
  const target = scenarios.find((scenario) => scenario.type === "target_margin");
  assert.equal(match?.price, 10_000);
  assert.equal(match?.eligible, false);
  assert.equal(match?.guardrail, "MINIMUM_MARGIN");
  assert.equal(target?.price, 12_857.14);
  assert.equal(target?.margin?.percentage, 30);
  assert.equal(target?.eligible, true);
});

test("TRAFFIC DRIVER permite margen bajo, pero ≤ costo exige permiso explícito", () => {
  const scenarios = calculateScenarios(9_500, 9_000, "traffic_driver", settings);
  assert.equal(scenarios.find((scenario) => scenario.type === "match_competitor")?.eligible, true);
  const belowCost = calculateScenarios(8_000, 9_000, "traffic_driver", settings);
  assert.equal(belowCost.find((scenario) => scenario.type === "match_competitor")?.guardrail, "PRICE_AT_OR_BELOW_COST");
});

test("recomendación usa target margin cuando igualar competencia rompe guardrails", () => {
  const result = buildPricingOpportunity(opportunity, settings);
  assert.equal(result.position, "very_expensive");
  assert.equal(result.recommendation?.type, "target_margin");
  assert.equal(result.recommendation?.price, 12_857.14);
  assert.equal(result.currentMargin?.percentage, 35.71);
});

test("schema separa selling price, audita y no escribe supplier_prices", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260830190000_pricing_intelligence_v1.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "lombardo_selling_prices",
    "lombardo_selling_price_history",
    "pricing_intelligence_settings",
    "product_commercial_profiles",
    "pricing_opportunity_decisions",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
  }
  assert.match(migration, /SELLING_PRICE_CHANGED_REVIEW_AGAIN/);
  assert.match(migration, /SUPPLIER_COST_CHANGED_REVIEW_AGAIN/);
  assert.match(migration, /COMPETITOR_PRICE_CHANGED_REVIEW_AGAIN/);
  assert.match(migration, /PRICE_AT_OR_BELOW_COST_BLOCKED/);
  assert.match(migration, /MINIMUM_MARGIN_GUARDRAIL/);
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.doesNotMatch(migration, /(insert\s+into|update|delete\s+from)\s+public\.supplier_prices/i);
  assert.doesNotMatch(migration, /grant[^;]*to\s+(anon|authenticated)/i);

  const alertMigration = await readFile(
    new URL("../supabase/migrations/20260830193000_competitor_alert_selling_price.sql", import.meta.url),
    "utf8",
  );
  assert.match(alertMigration, /coalesce\(selling\.current_price, price\.current_price\)/i);
  assert.match(alertMigration, /COMPETITOR_ALERT_PRICE_FRAGMENT_NOT_FOUND/);
});
