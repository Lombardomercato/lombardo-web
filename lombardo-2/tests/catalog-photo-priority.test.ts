import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Runia mantiene una señal derivada e indexada de imagen pública", async () => {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/20260901051033_catalog_photo_priority.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    migration,
    /add column has_public_media boolean not null default false/i,
  );
  assert.match(
    migration,
    /approval_status = 'approved'[\s\S]*rights_status in \('owned', 'licensed', 'approved'\)/i,
  );
  assert.match(
    migration,
    /after insert or delete or update of[\s\S]*approval_status,[\s\S]*rights_status[\s\S]*on public\.supplier_product_media/i,
  );
  assert.match(
    migration,
    /supplier_products_public_catalog_photo_order_idx[\s\S]*has_public_media desc[\s\S]*eligibility_status = 'safe'/i,
  );
  assert.match(
    migration,
    /revoke all on function public\.supplier_refresh_public_media_flag\(\)[\s\S]*from public, anon, authenticated/i,
  );
});

test("Guías, Cava y automatizaciones exigen productos con foto", async () => {
  const files = await Promise.all(
    [
      "../lib/seo/guide-products.ts",
      "../lib/server/automations/tasks.ts",
      "../lib/server/secret-cellar/secret-cellar-service.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const source of files) {
    assert.match(source, /requireImage:\s*true/);
  }
});

test("Home no vuelve a introducir una selección arbitraria de productos", async () => {
  const [home, opportunities, selection] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/oportunidades/page.tsx", import.meta.url), "utf8"),
    readFile(
      new URL("../lib/commerce/opportunity-selection.ts", import.meta.url),
      "utf8",
    ),
  ]);
  const discovery = await readFile(
    new URL("../components/home/CommercialDiscovery.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(home, /requireImage:\s*true/);
  assert.doesNotMatch(discovery, /Algunas buenas ideas/i);
  assert.doesNotMatch(discovery, /ProductCard/);
  assert.match(home, /completeOpportunitySelection/);
  assert.match(opportunities, /completeOpportunitySelection/);
  assert.match(selection, /opportunities\.length !== 5/);
  assert.match(selection, /!product\.opportunity/);
  assert.match(selection, /products:\s*\[\.\.\.opportunities, recommendation\]/);
});
