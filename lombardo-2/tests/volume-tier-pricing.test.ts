import assert from "node:assert/strict";
import test from "node:test";

import {
  bottleUnits,
  qualifiesForWholesaleBottleTier,
  resolveVolumeTierProducts,
} from "../lib/pricing/volume-tier.ts";
import type { CustomerPricingContext } from "../lib/server/customers/types.ts";
import type { Product } from "../types/commerce.ts";

const retailContext: CustomerPricingContext = {
  tenantSlug: "lombardo",
  accountType: "RETAIL",
  policy: "RETAIL",
  basePriceType: "retail",
  discountPercent: 0,
  contextKey: "guest:RETAIL",
};

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "10000000-0000-4000-8000-000000000001",
    sku: "VIN001",
    slug: "vino-test",
    name: "Vino Test",
    description: "",
    presentation: "750 ml",
    brand: { id: "brand", slug: "brand", name: "Brand" },
    category: { id: "vinos", slug: "vinos", name: "Vinos" },
    price: 10_000,
    basePrice: 10_000,
    priceType: "retail",
    pricingPolicy: "RETAIL",
    discountPercent: 0,
    pricingContextKey: retailContext.contextKey,
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images: [],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
    ...overrides,
  };
}

test("desde 6 botellas surtidas califica para precio mayorista", () => {
  const first = product();
  const second = product({ id: "10000000-0000-4000-8000-000000000002" });
  assert.equal(qualifiesForWholesaleBottleTier(
    [first, second],
    [{ productId: first.id, quantity: 3 }, { productId: second.id, quantity: 3 }],
  ), true);
});

test("un pack de 6 botellas cuenta sus unidades reales", () => {
  const box = product({ presentation: "6 botellas" });
  assert.equal(bottleUnits(box, 1), 6);
});

test("café y accesorios no activan el umbral de botellas", () => {
  const coffee = product({
    category: { id: "gourmet", slug: "gourmet", name: "Gourmet" },
    presentation: "250 g",
  });
  assert.equal(qualifiesForWholesaleBottleTier(
    [coffee],
    [{ productId: coffee.id, quantity: 6 }],
  ), false);
});

test("el umbral reemplaza sólo por un precio mayorista realmente mejor", async () => {
  const retail = product();
  const wholesale = product({
    price: 8_500,
    basePrice: 8_500,
    priceType: "wholesale",
    pricingPolicy: "WHOLESALE",
  });
  const result = await resolveVolumeTierProducts({
    products: [retail],
    quantities: [{ productId: retail.id, quantity: 6 }],
    pricingContext: retailContext,
    loadWholesale: async () => [wholesale],
  });
  assert.equal(result.applied, true);
  assert.equal(result.products[0]?.price, 8_500);
  assert.equal(result.products[0]?.pricingPolicy, "WHOLESALE");
  assert.equal(result.products[0]?.pricingContextKey, retailContext.contextKey);
});
