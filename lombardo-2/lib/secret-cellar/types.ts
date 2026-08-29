export type SecretCellarClueSource =
  | "CATEGORY"
  | "PRICE"
  | "PRESENTATION"
  | "BRAND_INITIAL"
  | "NAME_INITIAL"
  | "NAME_TOKEN";

export interface SecretCellarCandidate {
  id: string;
  slug: string;
  name: string;
  brand: string;
  categorySlug: string;
  categoryName: string;
  presentation: string;
  price: number;
  imageUrl: string;
}

export interface SecretCellarClue {
  id: string;
  text: string;
  source: SecretCellarClueSource;
}

export interface SecretCellarSettings {
  enabled: boolean;
  candidateCount: number;
  clueCount: number;
  rewardPercentage: number;
  rewardValidHours: number;
}

export interface SecretCellarChallenge {
  id: string;
  tenantId: string;
  date: string;
  status: "ACTIVE" | "SCHEDULED";
  secretProductId: string;
  candidates: SecretCellarCandidate[];
  clues: SecretCellarClue[];
  rewardPercentage: number;
  rewardValidHours: number;
  generatedBy: "DAILY_ENGINE" | "ADMIN_NEXT_REGENERATION" | "DAILY_FALLBACK";
  createdAt: string;
}

export interface SecretCellarPublicExperience {
  enabled: boolean;
  challenge?: {
    id: string;
    date: string;
    candidates: SecretCellarCandidate[];
    clues: SecretCellarClue[];
    rewardPercentage: number;
    rewardValidHours: number;
    playerIsAuthenticated: boolean;
  };
}

export interface SecretCellarAttemptResult {
  status: "RECORDED" | "ALREADY_PLAYED";
  result: "FOUND" | "MISSED";
  couponCode?: string;
  couponExpiresAt?: string;
  secret: SecretCellarCandidate;
}

export interface SecretCellarAttempt {
  id: string;
  playerLabel: string;
  selectedProductId: string;
  result: "FOUND" | "MISSED";
  couponCode?: string;
  promotionId?: string;
  attemptedAt: string;
}

export interface SecretCellarExclusion {
  productId: string;
  productName: string;
  productSku: string;
  reason: string;
  createdAt: string;
}

export interface SecretCellarAdminDashboard {
  settings: SecretCellarSettings;
  current?: SecretCellarChallenge;
  next?: SecretCellarChallenge;
  attempts: SecretCellarAttempt[];
  exclusions: SecretCellarExclusion[];
  participants: number;
  found: number;
  missed: number;
  couponsIssued: number;
  converted: number;
}
