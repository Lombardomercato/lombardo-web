export const COMPETITOR_CONFIDENCE_BANDS = ["high", "medium", "low", "none"] as const;
export type CompetitorConfidenceBand = (typeof COMPETITOR_CONFIDENCE_BANDS)[number];

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
