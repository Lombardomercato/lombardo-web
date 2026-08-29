import assert from "node:assert/strict";
import test from "node:test";
import {
  bestPublicCatalogMatch,
  comparePublicCatalogImage,
  reviewRiskForMatch,
  visualVariantForSku,
} from "../lib/images/mass-image-matcher.ts";

const product = {
  id: "1",
  sku: "ADL003B",
  name: "ANDELUNA RAICES Malbec x750cc",
  presentation: "750 ml",
};

function candidate(name: string) {
  return {
    key: name,
    source: "positano",
    tier: "positano" as const,
    sourceUrl: `https://www.positanovinos.com.ar/productos/${name}/`,
    imageUrl: `https://acdn-us.mitiendanube.com/stores/test/${name}.webp`,
    name,
  };
}

test("matcher auto-publica una identidad completa sin conflictos", () => {
  const match = comparePublicCatalogImage(product, candidate("Andeluna Raices Malbec 750 ml"));
  assert.equal(match.band, "high");
  assert.equal(match.hardConflicts.length, 0);
  assert.equal(match.needsReview, false);
});

test("matcher bloquea una línea distinta aprendida del QA", () => {
  const match = comparePublicCatalogImage(
    { ...product, sku: "BIA062B", name: "BIANCHI Chardonnay x 750 cc" },
    candidate("Bianchi Maria Carmen Chardonnay 750 ml"),
  );
  assert.ok(match.hardConflicts.includes("línea claramente diferente"));
});

test("NEEDS_REVIEW prioriza riesgo de presentación antes que confianza", () => {
  const match = comparePublicCatalogImage(product, candidate("Andeluna Raices Malbec"));
  assert.equal(reviewRiskForMatch(match).rank, 4);
  assert.match(reviewRiskForMatch(match).reason, /presentación|volumen/i);
});

test("riesgo V2 aprende producto, línea, varietal, volumen y pack de los falsos positivos", () => {
  const wrongProduct = comparePublicCatalogImage(
    { ...product, name: "JUNIOR Malbec x 750cc" },
    { ...candidate("Ginebra Hilbing Malbec 750 ml"), sourceUrl: "https://licoresjunior.com/producto/ginebra-hilbing-malbec-750-ml/" },
  );
  const wrongLine = comparePublicCatalogImage(
    { ...product, name: "ALYDA Van Salentein Millesime" },
    candidate("Alyda Van Salentein Brut Nature Rose 750ml"),
  );
  const wrongVarietal = comparePublicCatalogImage(product, candidate("Andeluna Raices Cabernet Sauvignon 750 ml"));
  const wrongVolume = comparePublicCatalogImage(product, candidate("Andeluna Raices Malbec 500 ml"));
  const wrongPack = comparePublicCatalogImage(product, candidate("Pack x 6 Andeluna Raices Malbec 750 ml"));
  assert.equal(reviewRiskForMatch(wrongProduct).kind, "product");
  assert.equal(reviewRiskForMatch(wrongLine).kind, "brand_line");
  assert.equal(reviewRiskForMatch(wrongVarietal).kind, "varietal");
  assert.equal(reviewRiskForMatch(wrongVolume).kind, "presentation_volume");
  assert.equal(reviewRiskForMatch(wrongPack).kind, "pack_unit");
});

test("matcher bloquea varietal, volumen y pack/unidad", () => {
  const varietal = comparePublicCatalogImage(product, candidate("Andeluna Raices Cabernet Sauvignon 750 ml"));
  const volume = comparePublicCatalogImage(product, candidate("Andeluna Raices Malbec 1 l"));
  const pack = comparePublicCatalogImage(product, candidate("Pack x 6 Andeluna Raices Malbec 750 ml"));
  assert.ok(varietal.hardConflicts.includes("varietal diferente"));
  assert.ok(volume.hardConflicts.includes("volumen diferente"));
  assert.ok(pack.hardConflicts.includes("pack/unidad"));
});

test("matcher conserva MEDIUM razonable como NEEDS_REVIEW", () => {
  const match = comparePublicCatalogImage(
    { ...product, name: "ANDELUNA RAICES Malbec" },
    candidate("Andeluna Raices Malbec Edicion 2025"),
  );
  assert.equal(match.band, "medium");
  assert.equal(match.hardConflicts.length, 0);
  assert.equal(match.needsReview, true);
});

test("best match elige la botella correcta y clasifica variante visual", () => {
  const match = bestPublicCatalogMatch(product, [
    candidate("Andeluna Raices Cabernet Sauvignon 750 ml"),
    candidate("Andeluna Raices Malbec 750 ml"),
  ]);
  assert.match(match.external?.name ?? "", /Malbec/);
  assert.equal(visualVariantForSku("CER010"), "beer");
  assert.equal(visualVariantForSku("ACC100"), "gifts");
  assert.equal(visualVariantForSku("ADL003B"), "wine");
});
