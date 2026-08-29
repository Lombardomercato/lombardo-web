import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20260828183715_products_v2_media_and_matching.sql", import.meta.url)),
  "utf8",
);

test("Productos V2 separa verdad VINROS de editorial Lombardo", () => {
  assert.match(migration, /create table public\.supplier_product_editorial/);
  assert.match(migration, /supplier_product_id uuid primary key references public\.supplier_products/);
  assert.doesNotMatch(migration, /update public\.supplier_prices/);
  assert.doesNotMatch(migration, /delete from public\.supplier_prices/);
});

test("la vista pública sólo entrega imágenes aprobadas para productos SAFE activos", () => {
  assert.match(migration, /create view public\.supplier_product_public_media/);
  assert.match(migration, /product\.active = true/);
  assert.match(migration, /product\.eligibility_status = 'safe'/);
  assert.match(migration, /media\.approval_status = 'approved'/);
  assert.match(migration, /media\.rights_status in \('owned', 'licensed', 'approved'\)/);
});

test("media vive en Storage, mantiene una principal e impide publicar externos sin derechos", () => {
  assert.match(migration, /insert into storage\.buckets/);
  assert.match(migration, /file_size_limit[\s\S]*5242880/);
  assert.match(migration, /supplier_product_media_one_primary_idx/);
  assert.match(migration, /source <> 'external_approved'[\s\S]*rights_status in \('licensed', 'approved'\)/);
  assert.match(migration, /external_image_candidates_publish_check/);
});

test("tablas editoriales, matching y RPC quedan server-only con RLS forzado", () => {
  for (const table of [
    "supplier_product_editorial",
    "supplier_product_media",
    "external_product_matches",
    "external_image_candidates",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`));
  }
  assert.doesNotMatch(migration, /grant .* to anon/);
  assert.doesNotMatch(migration, /grant .* to authenticated/);
});
