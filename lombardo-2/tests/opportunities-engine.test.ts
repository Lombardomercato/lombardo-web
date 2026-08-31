import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mapRuniaSupplierProduct, type RuniaSupplierProductRow } from "../lib/commerce/runia-catalog-mapper.ts";
import { retailPricingContext } from "../lib/server/customers/types.ts";

const migration = new URL("../supabase/migrations/20260831013000_opportunities_engine_v1.sql", import.meta.url);

function row(reviewAt: string): RuniaSupplierProductRow {
  return {
    runia_product_id: "443656dd-1d49-41b4-9f4b-f3e0becc917f",
    supplier_sku: "APE039B",
    name_raw: "CAMPARI Bitter x 750 c.c.",
    presentation_raw: "750 c.c.",
    normalized_presentation: "750 ml",
    active: true,
    eligibility_status: "safe",
    retail_prices: [{ price_type: "retail", current_price: 13_728.95 }],
    lombardo_prices: [{ id: "11111111-1111-4111-8111-111111111111", price_type: "retail", current_price: 11_990, version: 1, active: true }],
    opportunities: [{
      selling_price_id: "11111111-1111-4111-8111-111111111111",
      reference_price: 13_728.95,
      opportunity: true,
      opportunity_start: "2026-01-01T00:00:00.000Z",
      opportunity_review_at: reviewAt,
    }],
  };
}

test("una oportunidad visible usa selling price y reference price reales", () => {
  const product = mapRuniaSupplierProduct(
    row("2099-01-01T00:00:00.000Z"),
    retailPricingContext("lombardo"),
  );
  assert.equal(product.price, 11_990);
  assert.equal(product.opportunity?.referencePrice, 13_728.95);
});

test("una oportunidad vencida no conserva badge ni precio tachado", () => {
  const product = mapRuniaSupplierProduct(
    row("2026-01-02T00:00:00.000Z"),
    retailPricingContext("lombardo"),
  );
  assert.equal(product.opportunity, undefined);
  assert.equal(product.compareAtPrice, undefined);
});

test("schema de oportunidades es privado, auditado y nunca modifica VINROS", async () => {
  const sql = await readFile(migration, "utf8");
  assert.match(sql, /force row level security/g);
  assert.match(sql, /OPPORTUNITY_PRICE_MUST_BE_LOWER/);
  assert.match(sql, /PUBLIC_IMAGE_REQUIRED/);
  assert.match(sql, /MINIMUM_MARGIN_GUARDRAIL|lombardo_set_selling_price/);
  assert.match(sql, /GUARDRAIL_DISABLED/);
  assert.match(sql, /revoke all on table public\.lombardo_product_opportunities/);
  assert.doesNotMatch(sql, /update\s+public\.supplier_prices/i);
});

test("superficies públicas y analytics exponen el sistema sin auto-publicar", async () => {
  const [page, home, events, actions] = await Promise.all([
    readFile(new URL("../app/oportunidades/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/home/HomeOpportunities.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/analytics/commerce-events.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/admin/(protected)/competencia/PricingOpportunityActions.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(page, /active\.length >= 4/);
  assert.match(page, /productStructuredData/);
  assert.match(home, /VER TODAS/);
  for (const event of ["opportunity_view", "opportunity_product_click", "opportunity_add_to_cart", "opportunity_order"]) {
    assert.match(events, new RegExp(event));
  }
  assert.match(actions, /PUBLICAR COMO OPORTUNIDAD/);
  assert.doesNotMatch(actions, /auto.?publish/i);
});
