export const AUTOMATION_TYPES = [
  "vinros",
  "daily_cava",
  "daily_featured",
  "live_guides",
  "seo_content",
] as const;

export type AutomationType = (typeof AUTOMATION_TYPES)[number];
export type AutomationTrigger = "schedule" | "manual" | "retry";
export type AutomationStatus =
  | "running"
  | "completed"
  | "warning"
  | "failed"
  | "blocked"
  | "skipped";

export interface AutomationTaskResult {
  status: "completed" | "warning" | "blocked";
  summary: Record<string, unknown>;
  warnings?: string[];
  requiresReview?: boolean;
}

export interface AutomationRun {
  id: string;
  type: AutomationType;
  runKey: string;
  trigger: AutomationTrigger;
  status: AutomationStatus;
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  summary: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  alertStatus: string;
}

export interface AutomationExecutionResult {
  claimed: boolean;
  runId?: string;
  type: AutomationType;
  status: AutomationStatus;
  summary: Record<string, unknown>;
  reason?: string;
}

export interface HomeFeaturePin {
  id: string;
  productId: string;
  sku: string;
  name: string;
  position: number;
  createdAt: string;
}

export interface HomeDailyState {
  selectionDate: string;
  productIds: string[];
  categorySlugs: string[];
  guideSlugs: string[];
  fallback: boolean;
}

export interface AutomationContentEntry {
  id: string;
  type: "GUIDE" | "ARTICLE";
  slug: string;
  title: string;
  workflowStatus: "OPPORTUNITY" | "DRAFT" | "QA" | "APPROVED" | "PUBLISHED";
  liveRules: {
    categorySlug?: string;
    limit?: number;
    minimumPrice?: number;
    maximumPrice?: number;
    mode?: "category" | "search" | "search-list" | "price-cap";
    search?: string;
    searchTerms?: readonly string[];
    priceMax?: number;
  };
  lastLiveRefreshAt?: string;
}

export interface AutomationDashboard {
  rows: Array<{
    type: AutomationType;
    label: string;
    status: AutomationStatus | "never";
    lastRunAt?: string;
    nextRunAt: string;
    result: string;
    errors: string[];
  }>;
  pins: HomeFeaturePin[];
}
