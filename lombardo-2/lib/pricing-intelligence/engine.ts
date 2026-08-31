import { roundCurrency } from "../pricing/policy.ts";
import type {
  CommercialSensitivity,
  MarginResult,
  PricePosition,
  PricingIntelligenceSettings,
  PricingOpportunity,
  PricingOpportunityInput,
  PricingScenario,
  PricingScenarioType,
} from "./types";

function roundPercentage(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateMargin(price: number, cost?: number): MarginResult | undefined {
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || (cost ?? 0) <= 0) {
    return undefined;
  }
  const amount = roundCurrency(price - (cost as number));
  return {
    amount,
    percentage: roundPercentage((amount / price) * 100),
    markupPercentage: roundPercentage((amount / (cost as number)) * 100),
  };
}

export function marketDifference(lombardoPrice: number, competitorPrice: number) {
  if (lombardoPrice <= 0 || competitorPrice <= 0) return {};
  const amount = roundCurrency(lombardoPrice - competitorPrice);
  return {
    amount,
    percentage: roundPercentage((amount / competitorPrice) * 100),
  };
}

export function classifyPricePosition(
  differencePct: number,
  settings: PricingIntelligenceSettings,
): PricePosition {
  if (differencePct <= settings.veryCompetitiveMaxPct) return "very_competitive";
  if (differencePct <= settings.competitiveMaxPct) return "competitive";
  if (differencePct <= settings.marketMaxPct) return "in_market";
  if (differencePct <= settings.expensiveMaxPct) return "expensive";
  return "very_expensive";
}

function scenarioPrice(
  type: PricingScenarioType,
  competitorPrice: number,
  cost: number | undefined,
  targetMarginPct: number,
) {
  if (type === "match_competitor") return competitorPrice;
  if (type === "competitor_plus_5") return competitorPrice * 1.05;
  if (type === "competitor_minus_5") return competitorPrice * 0.95;
  if (!cost || cost <= 0 || targetMarginPct >= 100) return undefined;
  return cost / (1 - targetMarginPct / 100);
}

function calculateScenario(
  type: PricingScenarioType,
  competitorPrice: number,
  cost: number | undefined,
  sensitivity: CommercialSensitivity,
  settings: PricingIntelligenceSettings,
): PricingScenario {
  const rawPrice = scenarioPrice(type, competitorPrice, cost, settings.targetMarginPct);
  if (rawPrice === undefined) {
    return { type, eligible: false, guardrail: "MISSING_COST" };
  }
  const price = roundCurrency(rawPrice);
  const margin = calculateMargin(price, cost);
  const difference = marketDifference(price, competitorPrice);
  if (!margin) {
    return {
      type,
      price,
      marketDifferenceAmount: difference.amount,
      marketDifferencePct: difference.percentage,
      eligible: false,
      guardrail: "MISSING_COST",
    };
  }
  if (price <= (cost as number)) {
    return {
      type,
      price,
      margin,
      marketDifferenceAmount: difference.amount,
      marketDifferencePct: difference.percentage,
      eligible: false,
      guardrail: "PRICE_AT_OR_BELOW_COST",
    };
  }
  if (margin.percentage < settings.minimumMarginPct && sensitivity !== "traffic_driver") {
    return {
      type,
      price,
      margin,
      marketDifferenceAmount: difference.amount,
      marketDifferencePct: difference.percentage,
      eligible: false,
      guardrail: "MINIMUM_MARGIN",
    };
  }
  return {
    type,
    price,
    margin,
    marketDifferenceAmount: difference.amount,
    marketDifferencePct: difference.percentage,
    eligible: true,
  };
}

export function calculateScenarios(
  competitorPrice: number,
  cost: number | undefined,
  sensitivity: CommercialSensitivity,
  settings: PricingIntelligenceSettings,
) {
  return ([
    "match_competitor",
    "competitor_plus_5",
    "competitor_minus_5",
    "target_margin",
  ] as const).map((type) =>
    calculateScenario(type, competitorPrice, cost, sensitivity, settings),
  );
}

function recommendationFor(
  scenarios: PricingScenario[],
  currentPrice: number,
  position: PricePosition,
) {
  if (position !== "expensive" && position !== "very_expensive") return undefined;
  const byType = new Map(scenarios.map((scenario) => [scenario.type, scenario]));
  for (const type of ["match_competitor", "competitor_plus_5", "target_margin"] as const) {
    const scenario = byType.get(type);
    if (scenario?.eligible && scenario.price !== undefined && scenario.price < currentPrice) {
      return scenario;
    }
  }
  return undefined;
}

export function buildPricingOpportunity(
  input: PricingOpportunityInput,
  settings: PricingIntelligenceSettings,
): PricingOpportunity {
  const difference = marketDifference(input.lombardoSellingPrice, input.competitorPrice);
  if (difference.amount === undefined || difference.percentage === undefined) {
    throw new Error("La oportunidad requiere precios Lombardo y competencia válidos.");
  }
  const position = classifyPricePosition(difference.percentage, settings);
  const scenarios = calculateScenarios(
    input.competitorPrice,
    input.supplierCost,
    input.commercialSensitivity,
    settings,
  );
  const recommendation = recommendationFor(scenarios, input.lombardoSellingPrice, position);
  return {
    ...input,
    differenceAmount: difference.amount,
    differencePct: difference.percentage,
    position,
    currentMargin: calculateMargin(input.lombardoSellingPrice, input.supplierCost),
    scenarios,
    recommendation,
    impactScore: roundCurrency(Math.max(difference.amount, 0) * input.matchConfidence),
  };
}
