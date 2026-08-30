export const PRICE_POSITIONS = [
  "very_competitive",
  "competitive",
  "in_market",
  "expensive",
  "very_expensive",
] as const;
export type PricePosition = (typeof PRICE_POSITIONS)[number];

export const COMMERCIAL_SENSITIVITIES = [
  "known_comparable",
  "long_tail",
  "premium",
  "gift",
  "traffic_driver",
] as const;
export type CommercialSensitivity = (typeof COMMERCIAL_SENSITIVITIES)[number];

export const PRICING_SCENARIOS = [
  "match_competitor",
  "competitor_plus_5",
  "competitor_minus_5",
  "target_margin",
] as const;
export type PricingScenarioType = (typeof PRICING_SCENARIOS)[number];

export interface PricingIntelligenceSettings {
  veryCompetitiveMaxPct: number;
  competitiveMaxPct: number;
  marketMaxPct: number;
  expensiveMaxPct: number;
  minimumMarginPct: number;
  targetMarginPct: number;
  competitorMaxAgeHours: number;
}

export interface MarginResult {
  amount: number;
  percentage: number;
  markupPercentage: number;
}

export type ScenarioGuardrail =
  | "MISSING_COST"
  | "PRICE_AT_OR_BELOW_COST"
  | "MINIMUM_MARGIN";

export interface PricingScenario {
  type: PricingScenarioType;
  price?: number;
  margin?: MarginResult;
  marketDifferenceAmount?: number;
  marketDifferencePct?: number;
  eligible: boolean;
  guardrail?: ScenarioGuardrail;
}

export interface PricingOpportunityInput {
  competitorProductId: string;
  competitorName: string;
  externalName: string;
  externalProductUrl: string;
  competitorPrice: number;
  competitorFetchedAt: string;
  competitorPriceChangedAt?: string;
  runiaProductId: string;
  runiaSku: string;
  runiaName: string;
  eligibilityStatus: string;
  category: string;
  matchConfidence: number;
  confidenceBand: string;
  supplierCost?: number;
  supplierRetail: number;
  lombardoSellingPrice: number;
  sellingPriceSource: "SUPPLIER_RETAIL_FALLBACK" | "LOMBARDO_SELLING_PRICE";
  sellingPriceVersion: number;
  vinrosChangedAt?: string;
  commercialSensitivity: CommercialSensitivity;
  classificationSource: "manual" | "rule";
  decisionStatus: "pending" | "ignored" | "applied";
}

export interface PricingOpportunity extends PricingOpportunityInput {
  differenceAmount: number;
  differencePct: number;
  position: PricePosition;
  currentMargin?: MarginResult;
  scenarios: PricingScenario[];
  recommendation?: PricingScenario;
  impactScore: number;
}

