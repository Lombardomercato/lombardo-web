import type {
  CustomerPricingContext,
  CustomerPricingPolicy,
  SupplierSalePriceType,
} from "../server/customers/types";

export interface ResolvedCommercialPrice {
  baseUnitPrice: number;
  finalUnitPrice: number;
  discountAmount: number;
  discountPercent: number;
  priceType: SupplierSalePriceType;
  pricingPolicy: CustomerPricingPolicy;
}

export function roundCurrency(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function resolveCommercialPrice(
  rawBasePrice: number,
  context: CustomerPricingContext,
): ResolvedCommercialPrice {
  if (!Number.isFinite(rawBasePrice) || rawBasePrice <= 0) {
    throw new Error("El producto no tiene un precio base válido.");
  }
  const discountPercent =
    context.policy === "CUSTOM_DISCOUNT" ? context.discountPercent : 0;
  if (
    !Number.isFinite(discountPercent) ||
    discountPercent < 0 ||
    discountPercent >= 100
  ) {
    throw new Error("La política comercial tiene un descuento inválido.");
  }

  const baseUnitPrice = roundCurrency(rawBasePrice);
  const finalUnitPrice = roundCurrency(
    baseUnitPrice * (1 - discountPercent / 100),
  );
  return {
    baseUnitPrice,
    finalUnitPrice,
    discountAmount: roundCurrency(baseUnitPrice - finalUnitPrice),
    discountPercent,
    priceType: context.basePriceType,
    pricingPolicy: context.policy,
  };
}
