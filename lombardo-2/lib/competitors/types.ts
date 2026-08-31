export const COMPETITOR_CONFIDENCE_BANDS = ["high", "medium", "low", "none"] as const;
export type CompetitorConfidenceBand = (typeof COMPETITOR_CONFIDENCE_BANDS)[number];

export const ACTIVE_COMPETITOR_SLUGS = [
  "positano",
  "vinoteca-campos",
  "al-vino-vino",
  "vinos-rosario",
  "rosario-vinos-exclusivos",
] as const;
export type ActiveCompetitorSlug = (typeof ACTIVE_COMPETITOR_SLUGS)[number];

export const PRICE_SIGNALS = ["strong", "medium", "weak", "invalid"] as const;
export type PriceSignal = (typeof PRICE_SIGNALS)[number];

export const ECONOMIC_SCENARIOS = [
  "product_price",
  "pickup_total",
  "delivery_small_basket",
  "delivery_large_basket",
] as const;
export type EconomicScenario = (typeof ECONOMIC_SCENARIOS)[number];

export type PriceSource = "ecommerce" | "tariff" | "whatsapp" | "secondary";
export type CheckoutType = "full" | "whatsapp" | "none";
export type StockStatus = "in_stock" | "out_of_stock" | "unknown";
export type MarketPosition = "cheaper" | "in_market" | "more_expensive" | "insufficient_data";

export interface CompetitorCommercialObservation {
  id: string;
  competitorSlug: ActiveCompetitorSlug;
  competitorName: string;
  productKey: string;
  externalName: string;
  sourceUrl?: string;
  priceSource: PriceSource;
  listPrice?: number;
  promotionalPrice?: number;
  transferPrice?: number;
  transferDiscountPct?: number;
  unitPrice?: number;
  bulkPrice?: number;
  unitsPerBulk?: number;
  stockStatus: StockStatus;
  cartAvailable?: boolean;
  pickupCost?: number;
  deliveryCost?: number;
  freeDeliveryThreshold?: number;
  otherPaymentSurchargePct?: number;
  paymentConditions?: string;
  availabilityTerms?: string;
  priceChangeConditional: boolean;
  checkoutType: CheckoutType;
  checkoutConfidence: number;
  priceSignal: PriceSignal;
  executable: boolean;
  observedAt: string;
  note?: string;
}

export interface ScenarioPrice {
  amount?: number;
  signal: PriceSignal;
  executable: boolean;
  note: string;
}

export interface ScenarioConclusion {
  scenario: EconomicScenario;
  lombardoTotal?: number;
  marketReference?: number;
  position: MarketPosition;
  usableSignals: number;
}

export interface TopCompetitorPriceRow {
  productKey: string;
  productName: string;
  runiaProductId?: string;
  runiaSku?: string;
  vinrosCost?: number;
  lombardoPrice?: number;
  competitors: Partial<Record<ActiveCompetitorSlug, CompetitorCommercialObservation>>;
  scenarioPrices: Partial<Record<ActiveCompetitorSlug, Record<EconomicScenario, ScenarioPrice>>>;
  conclusions: Record<EconomicScenario, ScenarioConclusion>;
  recommendation: string;
}

export interface MultiCompetitorDashboard {
  generatedAt: string;
  sources: Array<{
    slug: ActiveCompetitorSlug;
    name: string;
    priority: "high" | "medium" | "secondary" | "b2b";
    priceSource: PriceSource;
    checkoutType: CheckoutType;
    active: boolean;
  }>;
  topTen: TopCompetitorPriceRow[];
}

export const COMPETITOR_ALERT_TYPES = [
  "lombardo_more_expensive",
  "competitor_price_change",
  "match_lost",
] as const;
export type CompetitorAlertType = (typeof COMPETITOR_ALERT_TYPES)[number];

export interface ExternalCompetitorProduct {
  externalId: string;
  externalProductUrl: string;
  externalName: string;
  brand?: string;
  presentation?: string;
  category?: string;
  ean?: string;
  externalSku?: string;
  currentPrice?: number;
  listPrice?: number;
  promotionText?: string;
  available: boolean;
  fetchedAt: string;
  raw: Record<string, unknown>;
}

export interface RuniaCompetitorProduct {
  id: string;
  sku: string;
  name: string;
  presentation: string;
  brand?: string;
  category?: string;
  ean?: string;
  retailPrice: number;
  costPrice?: number;
}

export interface CompetitorMatchDecision {
  runiaProductId?: string;
  suggestedRuniaProductId?: string;
  confidence: number;
  band: CompetitorConfidenceBand;
  matchedFields: string[];
  conflicts: string[];
  runnerUpConfidence?: number;
}

export interface CompetitorScrapeResult {
  products: ExternalCompetitorProduct[];
  pagesFetched: number;
  pagesDiscovered: number;
  objectsDetected: number;
  structuralSignature: string;
  robotsAllowed: boolean;
}

export interface CompetitorRunSummary {
  runId: string;
  status: "completed" | "warning" | "failed" | "blocked" | "skipped";
  productsSeen: number;
  productsParsed: number;
  high: number;
  medium: number;
  low: number;
  noMatch: number;
  matched: number;
  priceChanges: number;
  alertsCreated: number;
  alertsSent: number;
  warnings: string[];
}

export interface CompetitorDashboardFilters {
  brand?: string;
  category?: string;
  confidence?: CompetitorConfidenceBand;
  minimumDifferencePct?: number;
  maximumDifferencePct?: number;
}

export interface CompetitorComparisonRow {
  id: string;
  externalName: string;
  externalProductUrl: string;
  brand: string;
  category: string;
  currentPrice?: number;
  listPrice?: number;
  promotionText?: string;
  fetchedAt: string;
  available: boolean;
  runiaProductId?: string;
  runiaSku?: string;
  runiaName?: string;
  lombardoRetailPrice?: number;
  vinrosCost?: number;
  confidence: number;
  confidenceBand: CompetitorConfidenceBand;
  matchMethod: "auto" | "manual" | "none" | "rejected";
  manualOverride: boolean;
  suggestedRuniaProductId?: string;
  matchedFields: string[];
  conflicts: string[];
  differenceAmount?: number;
  differencePct?: number;
}

export interface CompetitorAlertRule {
  id: string;
  type: CompetitorAlertType;
  enabled: boolean;
  thresholdPct: number;
  cooldownHours: number;
}

export interface CompetitorRunView {
  id: string;
  status: string;
  trigger: string;
  startedAt: string;
  finishedAt?: string;
  pagesFetched: number;
  productsParsed: number;
  matched: number;
  high: number;
  medium: number;
  low: number;
  noMatch: number;
  priceChanges: number;
  alertsCreated: number;
  circuitSignature?: string;
  errors: string[];
}

export interface CompetitorDashboard {
  competitor: {
    id: string;
    name: string;
    circuitState: "closed" | "open";
    circuitReason?: string;
  };
  latestRun?: CompetitorRunView;
  rules: CompetitorAlertRule[];
  rows: CompetitorComparisonRow[];
  allRows: CompetitorComparisonRow[];
  brands: string[];
  categories: string[];
  metrics: {
    total: number;
    matched: number;
    high: number;
    medium: number;
    low: number;
    noMatch: number;
    lombardoCheaper: number;
    equal: number;
    lombardoMoreExpensive: number;
    recentChanges: number;
  };
}

export interface CompetitorPriceHistoryPoint {
  id: string;
  fetchedAt: string;
  currentPrice?: number;
  listPrice?: number;
  promotionText?: string;
}

export interface CompetitorMatchHistoryPoint {
  id: string;
  changedAt: string;
  previousRuniaProductId?: string;
  runiaProductId?: string;
  previousConfidence?: number;
  confidence: number;
  previousBand?: string;
  band: string;
  method: string;
  reason: string;
}

export interface CompetitorProductDetail {
  row: CompetitorComparisonRow;
  history: CompetitorPriceHistoryPoint[];
  matchHistory: CompetitorMatchHistoryPoint[];
}
