export type CustomerAccountType = "RETAIL" | "WHOLESALE" | "BUSINESS";

export type CustomerPricingPolicy =
  | "RETAIL"
  | "WHOLESALE"
  | "BUSINESS"
  | "CUSTOM_DISCOUNT";

export type SupplierSalePriceType = "retail" | "wholesale" | "business";

export interface CustomerPricingContext {
  tenantRecordId?: string;
  tenantSlug: string;
  authUserId?: string;
  customerAccountId?: string;
  accountType: CustomerAccountType;
  policy: CustomerPricingPolicy;
  basePriceType: SupplierSalePriceType;
  discountPercent: number;
  contextKey: string;
}

export interface CustomerAccountSummary {
  id: string;
  tenantId: string;
  authUserId: string;
  name: string;
  email: string;
  whatsapp: string;
  accountType: CustomerAccountType;
  pricingPolicy: CustomerPricingPolicy;
  discountPercent: number;
  status: "active" | "inactive" | "pending" | "blocked";
}

export function retailPricingContext(tenantSlug: string): CustomerPricingContext {
  return {
    tenantSlug,
    accountType: "RETAIL",
    policy: "RETAIL",
    basePriceType: "retail",
    discountPercent: 0,
    contextKey: "guest:RETAIL",
  };
}
