import assert from "node:assert/strict";
import test from "node:test";

import { evaluatePromotion } from "../lib/promotions/engine.ts";
import type { PromotionRuntimeRecord } from "../lib/promotions/types.ts";

const line = {
  productId: "25dd0000-0000-4000-8000-000000000001",
  categorySlug: "vinos",
  quantity: 1,
  commercialUnitPrice: 13_050.05,
};

function promotion(overrides: Partial<PromotionRuntimeRecord> = {}): PromotionRuntimeRecord {
  return {
    id: "90000000-0000-4000-8000-000000000001",
    tenantId: "17c7fda1-0b07-47bd-8379-f0bd00fac1de",
    code: "HITO3-10",
    name: "Hito 3 diez por ciento",
    status: "ACTIVE",
    discountType: "PERCENTAGE",
    discountValue: 10,
    minimumOrderAmount: 0,
    appliesTo: "ALL",
    customerScope: "ALL",
    stackable: false,
    firstOrderOnly: false,
    productIds: [],
    categorySlugs: [],
    customerAccountIds: [],
    activeUses: 0,
    customerActiveUses: 0,
    validOrderCount: 0,
    ...overrides,
  };
}

test("A. RETAIL + cupón 10% aplica sobre el precio comercial", () => {
  const result = evaluatePromotion({ promotion: promotion(), identity: { policy: "RETAIL" }, lines: [line] });
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.equal(result.promotion.discountAmount, 1_305);
  assert.equal(result.promotion.finalSubtotal, 11_745.05);
  assert.equal(result.promotion.lines[0]?.finalUnitPrice, 11_745.05);
});

for (const policy of ["WHOLESALE", "BUSINESS", "CUSTOM_DISCOUNT"] as const) {
  test(`${policy} rechaza un cupón no acumulable`, () => {
    const result = evaluatePromotion({ promotion: promotion(), identity: { policy }, lines: [line] });
    assert.deepEqual({ valid: result.valid, code: result.code }, { valid: false, code: "NOT_STACKABLE" });
  });
}

test("E. CUSTOM_DISCOUNT + cupón stackable aplica después de la política", () => {
  const result = evaluatePromotion({
    promotion: promotion({ stackable: true }),
    identity: { policy: "CUSTOM_DISCOUNT", customerAccountId: "customer-1" },
    lines: [{ ...line, commercialUnitPrice: 11_745.05 }],
  });
  assert.equal(result.valid, true);
  if (result.valid) assert.equal(result.promotion.finalSubtotal, 10_570.55);
});

test("F. cupón vencido es rechazado", () => {
  const result = evaluatePromotion({
    promotion: promotion({ endAt: "2026-01-01T00:00:00.000Z" }),
    identity: { policy: "RETAIL" }, lines: [line], now: new Date("2026-08-29T00:00:00.000Z"),
  });
  assert.equal(result.code, "EXPIRED");
});

test("G. compra mínima no alcanzada es rechazada", () => {
  const result = evaluatePromotion({ promotion: promotion({ minimumOrderAmount: 20_000 }), identity: { policy: "RETAIL" }, lines: [line] });
  assert.equal(result.code, "MINIMUM_NOT_MET");
});

test("límite por cliente considera reservas activas", () => {
  const result = evaluatePromotion({ promotion: promotion({ maxUsesPerCustomer: 1, customerActiveUses: 1 }), identity: { policy: "RETAIL" }, lines: [line] });
  assert.equal(result.code, "ALREADY_USED");
});

test("scope de producto no aplica a otro SKU", () => {
  const result = evaluatePromotion({ promotion: promotion({ appliesTo: "PRODUCTS", productIds: ["otro"] }), identity: { policy: "RETAIL" }, lines: [line] });
  assert.equal(result.code, "NOT_APPLICABLE");
});

test("monto fijo persiste el descuento real redondeado", () => {
  const result = evaluatePromotion({ promotion: promotion({ discountType: "FIXED_AMOUNT", discountValue: 1_000 }), identity: { policy: "RETAIL" }, lines: [line] });
  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.promotion.discountAmount, 1_000);
    assert.equal(result.promotion.finalSubtotal, 12_050.05);
  }
});

test("primera compra exige cuenta sin pedidos válidos", () => {
  const result = evaluatePromotion({ promotion: promotion({ firstOrderOnly: true, validOrderCount: 1 }), identity: { policy: "RETAIL", customerAccountId: "customer-1" }, lines: [line] });
  assert.equal(result.code, "FIRST_ORDER_ONLY");
});
