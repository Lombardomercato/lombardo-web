import {
  type AppliedPromotion,
  type PromotionLineInput,
  type PromotionPricingIdentity,
  type PromotionRuntimeRecord,
  type PromotionValidationResult,
} from "./types.ts";

const messages = {
  NOT_FOUND: "El código ingresado no es válido.",
  INACTIVE: "Este cupón está desactivado.",
  SCHEDULED: "Este cupón todavía no está vigente.",
  EXPIRED: "Este cupón está vencido.",
  MINIMUM_NOT_MET: "La compra mínima para este cupón todavía no fue alcanzada.",
  EXHAUSTED: "Este cupón ya alcanzó su límite de usos.",
  ALREADY_USED: "Este cupón ya fue utilizado por esta cuenta.",
  NOT_APPLICABLE: "Este cupón no aplica a tu cuenta o selección.",
  NOT_STACKABLE: "Este cupón no es acumulable con tu precio especial.",
  FIRST_ORDER_ONLY: "Este cupón es únicamente para la primera compra.",
} as const;

export function roundPromotionCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function normalizePromotionCode(value: string) {
  return value.trim().toLocaleUpperCase("en-US").replace(/\s+/g, "");
}

function rejected(
  code: Exclude<PromotionValidationResult["code"], "APPLIED">,
  extra: Partial<PromotionValidationResult> = {},
): PromotionValidationResult {
  return { valid: false, code, message: messages[code], ...extra } as PromotionValidationResult;
}

function accountScopeMatches(
  promotion: PromotionRuntimeRecord,
  identity: PromotionPricingIdentity,
) {
  switch (promotion.customerScope) {
    case "ALL": return true;
    case "RETAIL": return identity.policy === "RETAIL";
    case "WHOLESALE": return identity.policy === "WHOLESALE";
    case "BUSINESS": return identity.policy === "BUSINESS";
    case "CUSTOM": return identity.policy === "CUSTOM_DISCOUNT";
    case "SPECIFIC_CUSTOMERS":
      return Boolean(identity.customerAccountId) &&
        promotion.customerAccountIds.includes(identity.customerAccountId!);
  }
}

function eligibleLine(promotion: PromotionRuntimeRecord, line: PromotionLineInput) {
  if (promotion.appliesTo === "ALL") return true;
  if (promotion.appliesTo === "PRODUCTS") return promotion.productIds.includes(line.productId);
  return promotion.categorySlugs.includes(line.categorySlug);
}

function fixedDiscountLines(lines: PromotionLineInput[], configuredAmount: number) {
  const eligibleTotal = roundPromotionCurrency(lines.reduce(
    (sum, line) => sum + line.commercialUnitPrice * line.quantity,
    0,
  ));
  const target = Math.min(roundPromotionCurrency(configuredAmount), eligibleTotal);
  let remaining = target;
  return lines.map((line, index) => {
    const lineTotal = roundPromotionCurrency(line.commercialUnitPrice * line.quantity);
    const proportional = index === lines.length - 1
      ? remaining
      : roundPromotionCurrency(target * (lineTotal / eligibleTotal));
    const maxUnitDiscount = Math.floor((line.commercialUnitPrice * 100) + Number.EPSILON) / 100;
    const unitDiscount = Math.min(
      maxUnitDiscount,
      Math.floor((proportional / line.quantity) * 100 + Number.EPSILON) / 100,
    );
    const discountAmount = roundPromotionCurrency(unitDiscount * line.quantity);
    remaining = roundPromotionCurrency(Math.max(0, remaining - discountAmount));
    const finalUnitPrice = roundPromotionCurrency(line.commercialUnitPrice - unitDiscount);
    return {
      productId: line.productId,
      discountAmount,
      finalUnitPrice,
      finalLineTotal: roundPromotionCurrency(finalUnitPrice * line.quantity),
    };
  });
}

export function evaluatePromotion(input: {
  promotion: PromotionRuntimeRecord | null;
  identity: PromotionPricingIdentity;
  lines: PromotionLineInput[];
  now?: Date;
}): PromotionValidationResult {
  const { promotion, identity, lines } = input;
  if (!promotion) return rejected("NOT_FOUND");
  const now = input.now ?? new Date();
  if (promotion.status !== "ACTIVE") return rejected("INACTIVE");
  if (promotion.startAt && now < new Date(promotion.startAt)) return rejected("SCHEDULED");
  if (promotion.endAt && now >= new Date(promotion.endAt)) return rejected("EXPIRED");
  if (identity.policy !== "RETAIL" && !promotion.stackable) return rejected("NOT_STACKABLE");
  if (!accountScopeMatches(promotion, identity)) return rejected("NOT_APPLICABLE");
  if (promotion.firstOrderOnly && (!identity.customerAccountId || promotion.validOrderCount > 0)) {
    return rejected("FIRST_ORDER_ONLY");
  }
  if (promotion.maxTotalUses !== undefined && promotion.activeUses >= promotion.maxTotalUses) {
    return rejected("EXHAUSTED");
  }
  if (
    promotion.maxUsesPerCustomer !== undefined &&
    promotion.customerActiveUses >= promotion.maxUsesPerCustomer
  ) return rejected("ALREADY_USED");

  const commercialSubtotal = roundPromotionCurrency(lines.reduce(
    (sum, line) => sum + line.commercialUnitPrice * line.quantity,
    0,
  ));
  if (commercialSubtotal < promotion.minimumOrderAmount) {
    return rejected("MINIMUM_NOT_MET", { minimumOrderAmount: promotion.minimumOrderAmount });
  }
  const eligible = lines.filter((line) => eligibleLine(promotion, line));
  if (!eligible.length) return rejected("NOT_APPLICABLE");

  const eligibleQuotes = promotion.discountType === "PERCENTAGE"
    ? eligible.map((line) => {
        const finalUnitPrice = roundPromotionCurrency(
          line.commercialUnitPrice * (1 - promotion.discountValue / 100),
        );
        const discountAmount = roundPromotionCurrency(
          (line.commercialUnitPrice - finalUnitPrice) * line.quantity,
        );
        return {
          productId: line.productId,
          discountAmount,
          finalUnitPrice,
          finalLineTotal: roundPromotionCurrency(finalUnitPrice * line.quantity),
        };
      })
    : fixedDiscountLines(eligible, promotion.discountValue);
  const quoteByProduct = new Map(eligibleQuotes.map((quote) => [quote.productId, quote]));
  const quotedLines = lines.map((line) => quoteByProduct.get(line.productId) ?? {
    productId: line.productId,
    discountAmount: 0,
    finalUnitPrice: line.commercialUnitPrice,
    finalLineTotal: roundPromotionCurrency(line.commercialUnitPrice * line.quantity),
  });
  const discountAmount = roundPromotionCurrency(quotedLines.reduce(
    (sum, line) => sum + line.discountAmount,
    0,
  ));
  if (discountAmount <= 0) return rejected("NOT_APPLICABLE");

  const applied: AppliedPromotion = {
    promotionId: promotion.id,
    code: promotion.code,
    name: promotion.name,
    discountType: promotion.discountType,
    discountValue: promotion.discountValue,
    discountAmount,
    stackable: promotion.stackable,
    commercialSubtotal,
    finalSubtotal: roundPromotionCurrency(commercialSubtotal - discountAmount),
    lines: quotedLines,
  };
  return { valid: true, code: "APPLIED", promotion: applied, message: "Cupón aplicado." };
}
