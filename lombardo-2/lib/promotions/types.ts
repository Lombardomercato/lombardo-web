import type { CustomerPricingPolicy } from "@/lib/server/customers/types";

export type PromotionDiscountType = "PERCENTAGE" | "FIXED_AMOUNT";
export type PromotionAppliesTo = "ALL" | "PRODUCTS" | "CATEGORIES";
export type PromotionCustomerScope =
  | "ALL"
  | "RETAIL"
  | "WHOLESALE"
  | "BUSINESS"
  | "CUSTOM"
  | "SPECIFIC_CUSTOMERS";

export type PromotionValidationCode =
  | "APPLIED"
  | "NOT_FOUND"
  | "INACTIVE"
  | "SCHEDULED"
  | "EXPIRED"
  | "MINIMUM_NOT_MET"
  | "EXHAUSTED"
  | "ALREADY_USED"
  | "NOT_APPLICABLE"
  | "NOT_STACKABLE"
  | "FIRST_ORDER_ONLY";

export interface PromotionLineQuote {
  productId: string;
  discountAmount: number;
  finalUnitPrice: number;
  finalLineTotal: number;
}

export interface AppliedPromotion {
  promotionId: string;
  code: string;
  name: string;
  discountType: PromotionDiscountType;
  discountValue: number;
  discountAmount: number;
  stackable: boolean;
  commercialSubtotal: number;
  finalSubtotal: number;
  lines: PromotionLineQuote[];
}

export type PromotionValidationResult =
  | { valid: true; code: "APPLIED"; promotion: AppliedPromotion; message: string }
  | {
      valid: false;
      code: Exclude<PromotionValidationCode, "APPLIED">;
      message: string;
      minimumOrderAmount?: number;
    };

export interface PromotionLineInput {
  productId: string;
  categorySlug: string;
  quantity: number;
  commercialUnitPrice: number;
}

export interface PromotionRuntimeRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  discountType: PromotionDiscountType;
  discountValue: number;
  startAt?: string;
  endAt?: string;
  minimumOrderAmount: number;
  maxTotalUses?: number;
  maxUsesPerCustomer?: number;
  appliesTo: PromotionAppliesTo;
  customerScope: PromotionCustomerScope;
  stackable: boolean;
  firstOrderOnly: boolean;
  productIds: string[];
  categorySlugs: string[];
  customerAccountIds: string[];
  activeUses: number;
  customerActiveUses: number;
  validOrderCount: number;
}

export interface PromotionPricingIdentity {
  policy: CustomerPricingPolicy;
  customerAccountId?: string;
}
