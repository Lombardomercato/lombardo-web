import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const files = {
  migration: fileURLToPath(new URL("../supabase/migrations/20260829052000_lombardo_product_image_system.sql", import.meta.url)),
  render: fileURLToPath(new URL("../components/product/LombardoProductRender.tsx", import.meta.url)),
  renderStyles: fileURLToPath(new URL("../components/product/LombardoProductRender.module.css", import.meta.url)),
  publicVisualStyles: fileURLToPath(new URL("../components/product/ProductVisual.module.css", import.meta.url)),
  pilot: fileURLToPath(new URL("../app/admin/(protected)/imagenes/sistema-lombardo/page.tsx", import.meta.url)),
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

test("public catalog keeps the full source master visible on desktop", async () => {
  const styles = await readFile(files.publicVisualStyles, "utf8");
  assert.match(styles, /\.photo img[\s\S]*object-fit: contain/);
  assert.match(styles, /\.photo img[\s\S]*padding: 12% 8%/);
  assert.doesNotMatch(styles, /\.photo img[\s\S]*object-fit: cover/);
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
  assert.match(styles, /inset: 12% 8% 12%/);
  assert.doesNotMatch(styles, /drop-shadow/);
  assert.doesNotMatch(render, /scale=/);
  assert.match(pilot, /products\.length === 12/);
  assert.doesNotMatch(pilot, /ProductVisual/);
});
