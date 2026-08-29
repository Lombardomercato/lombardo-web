import "server-only";

import {
  evaluatePromotion,
  normalizePromotionCode,
} from "@/lib/promotions/engine";
import type {
  PromotionLineInput,
  PromotionValidationResult,
} from "@/lib/promotions/types";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import { SupabasePromotionStore } from "./promotion-store";

export interface PromotionValidator {
  validate(input: {
    code: string;
    pricingContext: CustomerPricingContext;
    lines: PromotionLineInput[];
    customerEmail?: string;
  }): Promise<PromotionValidationResult>;
}

export class PromotionService implements PromotionValidator {
  constructor(private readonly store: SupabasePromotionStore) {}

  async validate(input: {
    code: string;
    pricingContext: CustomerPricingContext;
    lines: PromotionLineInput[];
    customerEmail?: string;
  }): Promise<PromotionValidationResult> {
    const code = normalizePromotionCode(input.code);
    if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code)) {
      return { valid: false, code: "NOT_FOUND", message: "El código ingresado no es válido." };
    }
    if (!input.pricingContext.tenantRecordId) {
      return { valid: false, code: "NOT_FOUND", message: "El código ingresado no es válido." };
    }
    const customerKey = input.pricingContext.customerAccountId
      ? `account:${input.pricingContext.customerAccountId}`
      : input.customerEmail
        ? `email:${input.customerEmail.trim().toLocaleLowerCase("en-US")}`
        : undefined;
    const promotion = await this.store.getRuntime({
      tenantId: input.pricingContext.tenantRecordId,
      code,
      customerAccountId: input.pricingContext.customerAccountId,
      customerKey,
    });
    return evaluatePromotion({
      promotion,
      identity: {
        policy: input.pricingContext.policy,
        customerAccountId: input.pricingContext.customerAccountId,
      },
      lines: input.lines,
    });
  }
}
