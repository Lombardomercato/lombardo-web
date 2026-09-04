import assert from "node:assert/strict";
import test from "node:test";
import { displayPresentation, displayProductName } from "../lib/commerce/product-presentation.ts";

test("normaliza nombres sólo para la presentación pública", () => {
  assert.equal(displayProductName("TRUMPETER MALBEC X 750CC X12B"), "Trumpeter Malbec");
  assert.equal(displayProductName("ACORDEON MALBEC X 750 C.C."), "Acordeon Malbec");
  assert.equal(displayProductName("AIME MALBEC X 750 C.C.."), "Aime Malbec");
  assert.equal(displayProductName("CHIVAS REGAL 12 AÑOS - CAJA X 6 BOTELLAS"), "Chivas Regal 12 Años");
  assert.equal(displayProductName("ESPUMANTE MAGNUM 1 5 L"), "Espumante Magnum 1,5 L");
  assert.equal(displayProductName("Rutini Cabernet Malbec"), "Rutini Cabernet Malbec");
});

test("unifica unidades de presentación sin inventar atributos", () => {
  assert.equal(displayPresentation("750CC"), "750 cc");
  assert.equal(displayPresentation("750 C.C."), "750 cc");
  assert.equal(displayPresentation("1 5 L"), "1,5 L");
  assert.equal(displayPresentation("1 LT"), "1 L");
  assert.equal(displayPresentation("6 UNIDADES"), "6 unidades");
});
