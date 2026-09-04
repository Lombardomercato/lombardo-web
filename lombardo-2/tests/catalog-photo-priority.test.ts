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

test("Home, guías, Cava y automatizaciones exigen productos con foto", async () => {
  const files = await Promise.all(
    [
      "../app/page.tsx",
      "../lib/seo/guide-products.ts",
      "../lib/server/automations/tasks.ts",
      "../lib/server/secret-cellar/secret-cellar-service.ts",
    ].map((path) => readFile(new URL(path, import.meta.url), "utf8")),
  );

  for (const source of files) {
    assert.match(source, /requireImage:\s*true/);
  }
});
