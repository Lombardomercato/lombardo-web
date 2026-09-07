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
    wholesaleEligible: true,
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

test("0 a 5 no activan; 6, 7 y 12 botellas elegibles sí activan", () => {
  const wine = product();
  for (const quantity of [0, 1, 2, 3, 4, 5, 6, 7, 12]) {
    assert.equal(
      qualifiesForWholesaleBottleTier(
        [wine],
        [{ productId: wine.id, quantity }],
      ),
      quantity >= 6,
      `cantidad ${quantity}`,
    );
  }
});

test("5 botellas más café o 4 botellas más 2 copas no califican", () => {
  const wine = product();
  const coffee = product({
    id: "10000000-0000-4000-8000-000000000002",
    category: { id: "gourmet", slug: "gourmet", name: "Gourmet" },
    presentation: "250 g",
    wholesaleEligible: false,
  });
  const glasses = product({
    id: "10000000-0000-4000-8000-000000000003",
    category: { id: "regalos", slug: "regalos", name: "Accesorios" },
    presentation: "2 unidades",
    wholesaleEligible: false,
  });
  assert.equal(qualifiesForWholesaleBottleTier(
    [wine, coffee],
    [{ productId: wine.id, quantity: 5 }, { productId: coffee.id, quantity: 1 }],
  ), false);
  assert.equal(qualifiesForWholesaleBottleTier(
    [wine, glasses],
    [{ productId: wine.id, quantity: 4 }, { productId: glasses.id, quantity: 2 }],
  ), false);
});

test("un producto sin lista mayorista real no completa el umbral", async () => {
  const withWholesale = product();
  const withoutWholesale = product({
    id: "10000000-0000-4000-8000-000000000002",
    wholesaleEligible: true,
  });
  const wholesale = product({
    price: 8_500,
    basePrice: 8_500,
    priceType: "wholesale",
    pricingPolicy: "WHOLESALE",
  });
  const result = await resolveVolumeTierProducts({
    products: [withWholesale, withoutWholesale],
    quantities: [
      { productId: withWholesale.id, quantity: 5 },
      { productId: withoutWholesale.id, quantity: 1 },
    ],
    pricingContext: retailContext,
    loadWholesale: async () => [wholesale],
  });
  assert.equal(result.bottleCount, 5);
  assert.equal(result.applied, false);
  assert.equal(result.products[1]?.wholesaleEligible, false);
});

test("una cuenta Negocio conserva su lista y no se transforma en cuenta Mayorista", async () => {
  const businessContext: CustomerPricingContext = {
    ...retailContext,
    accountType: "BUSINESS",
    policy: "BUSINESS",
    basePriceType: "business",
  };
  const business = product({
    price: 7_500,
    basePrice: 7_500,
    priceType: "business",
    pricingPolicy: "BUSINESS",
  });
  let loaded = false;
  const result = await resolveVolumeTierProducts({
    products: [business],
    quantities: [{ productId: business.id, quantity: 12 }],
    pricingContext: businessContext,
    loadWholesale: async () => {
      loaded = true;
      return [];
    },
  });
  assert.equal(result.applied, false);
  assert.equal(result.products[0]?.pricingPolicy, "BUSINESS");
  assert.equal(loaded, false);
});
