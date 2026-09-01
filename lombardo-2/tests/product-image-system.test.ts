import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const files = {
  migration: fileURLToPath(new URL("../supabase/migrations/20260829052000_lombardo_product_image_system.sql", import.meta.url)),
  normalizationMigration: fileURLToPath(new URL("../supabase/migrations/20260830193000_product_image_transparent_renders.sql", import.meta.url)),
  normalizationRoute: fileURLToPath(new URL("../app/admin/api/product-images/normalize/route.ts", import.meta.url)),
  normalizationRenderer: fileURLToPath(new URL("../lib/server/images/normalized-product-render.ts", import.meta.url)),
  render: fileURLToPath(new URL("../components/product/LombardoProductRender.tsx", import.meta.url)),
  renderStyles: fileURLToPath(new URL("../components/product/LombardoProductRender.module.css", import.meta.url)),
  publicVisualStyles: fileURLToPath(new URL("../components/product/ProductVisual.module.css", import.meta.url)),
  pilot: fileURLToPath(new URL("../app/admin/(protected)/imagenes/sistema-lombardo/page.tsx", import.meta.url)),
  publicVisual: fileURLToPath(new URL("../components/product/ProductVisual.tsx", import.meta.url)),
  store: fileURLToPath(new URL("../lib/server/admin/runia-admin-store.ts", import.meta.url)),
};

test("product image system separates source masters from versioned renders", async () => {
  const [migration, store] = await Promise.all([
    readFile(files.migration, "utf8"),
    readFile(files.store, "utf8"),
  ]);
  assert.match(migration, /create table public\.supplier_product_image_renders/);
  assert.match(migration, /source_media_id uuid not null references public\.supplier_product_media/);
  assert.match(migration, /status in \('pilot', 'approved', 'retired'\)/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.supplier_product_image_renders from public, anon, authenticated/);
  assert.match(migration, /supplier_attach_product_source_master/);
  assert.match(migration, /'pending', 'approved'/);
  assert.match(store, /workflow === "source_master"/);
  assert.match(store, /supplier_attach_product_source_master/);
});

test("normalized renders preserve the master and publish only for SAFE products", async () => {
  const [migration, route, renderer] = await Promise.all([
    readFile(files.normalizationMigration, "utf8"),
    readFile(files.normalizationRoute, "utf8"),
    readFile(files.normalizationRenderer, "utf8"),
  ]);
  assert.match(migration, /supplier_publish_normalized_product_render/);
  assert.match(migration, /source_media_id = excluded\.source_media_id/);
  assert.match(migration, /product\.eligibility_status = 'safe'/);
  assert.match(migration, /'backgroundTreatment', 'transparent-edge-connected-v1'/);
  assert.match(migration, /'productOccupancy', 0\.8/);
  assert.match(migration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(route, /requireAdminRole\("admin"\)/);
  assert.match(route, /sameOrigin\(request\)/);
  assert.match(renderer, /removed\.confidence === "low"/);
});

test("public product imagery uses one white 80-percent canvas", async () => {
  const [styles, visual] = await Promise.all([
    readFile(files.publicVisualStyles, "utf8"),
    readFile(files.publicVisual, "utf8"),
  ]);
  assert.match(styles, /\.photo\s*\{[\s\S]*background: #fff/);
  assert.match(styles, /\.photo img[\s\S]*object-fit: contain/);
  assert.match(styles, /\.photo img[\s\S]*padding: 10%/);
  assert.match(styles, /\.photo img[\s\S]*object-position: center bottom/);
  assert.match(styles, /\.photo img[\s\S]*mix-blend-mode: multiply/);
  assert.doesNotMatch(styles, /\.photo img[\s\S]*object-fit: cover/);
  assert.match(styles, /\.photo\.normalized img[\s\S]*padding: 0/);
  assert.match(styles, /\.photo\.normalized img[\s\S]*mix-blend-mode: normal/);
  assert.match(visual, /unoptimized=\{isNormalizedRender\}/);
});

test("pilot uses one visual grammar with five controlled variants", async () => {
  const [render, styles, pilot] = await Promise.all([
    readFile(files.render, "utf8"),
    readFile(files.renderStyles, "utf8"),
    readFile(files.pilot, "utf8"),
  ]);
  for (const variant of ["wine", "spirits", "beer", "gourmet", "gifts"]) {
    assert.match(render, new RegExp(`\\b${variant}\\b`));
    assert.match(styles, new RegExp(`\\.${variant}\\b`));
  }
  assert.match(styles, /object-fit: contain/);
  assert.match(styles, /mix-blend-mode: multiply/);
  assert.match(styles, /\.render\s*\{[\s\S]*background: transparent/);
  assert.match(styles, /inset: 10%/);
  assert.doesNotMatch(styles, /drop-shadow/);
  assert.doesNotMatch(render, /scale=/);
  assert.match(pilot, /products\.length === 12/);
  assert.doesNotMatch(pilot, /ProductVisual/);
});
