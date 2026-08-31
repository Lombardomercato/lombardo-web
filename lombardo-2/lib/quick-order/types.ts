import type { CustomerAccountSummary, CustomerAccountType, CustomerPricingContext } from "@/lib/server/customers/types";
import type { Product } from "@/types/commerce";

export const QUICK_ORDER_SEARCH_LIMIT = 24;
export const QUICK_ORDER_MAX_SEARCH_LIMIT = 30;

export type QuickOrderAccountType = Extract<
  CustomerAccountType,
  "WHOLESALE" | "BUSINESS"
>;

export type QuickOrderAccess =
  | {
      allowed: true;
      account: CustomerAccountSummary & { accountType: QuickOrderAccountType };
    }
  | {
      allowed: false;
      reason: "SIGNED_OUT" | "INACTIVE" | "RETAIL";
    };

export interface QuickOrderProduct {
  product: Product;
  publicUnitPrice?: number;
}

export interface QuickOrderSearchInput {
  search: string;
  limit?: number;
}

export interface QuickOrderSearchResult {
  products: QuickOrderProduct[];
  queryTimeMs: number;
  truncated: boolean;
}

export interface QuickOrderProvider {
  searchProducts(
    input: QuickOrderSearchInput,
    pricingContext: CustomerPricingContext,
  ): Promise<QuickOrderSearchResult>;
}

export function resolveQuickOrderAccess(
  authUserId: string | null,
  account: CustomerAccountSummary | null,
): QuickOrderAccess {
  if (!authUserId) return { allowed: false, reason: "SIGNED_OUT" };
  if (!account) return { allowed: false, reason: "INACTIVE" };
  if (account.accountType === "RETAIL") {
    return { allowed: false, reason: "RETAIL" };
  }
  return {
    allowed: true,
    account: account as CustomerAccountSummary & {
      accountType: QuickOrderAccountType;
    },
  };
}

export function isQuickOrderPricingContext(
  context: CustomerPricingContext,
): boolean {
  if (!context.authUserId || !context.customerAccountId) return false;
  return (
    (context.accountType === "WHOLESALE" &&
      context.policy === "WHOLESALE" &&
      context.basePriceType === "wholesale") ||
    (context.accountType === "BUSINESS" &&
      context.policy === "BUSINESS" &&
      context.basePriceType === "business")
  );
}
