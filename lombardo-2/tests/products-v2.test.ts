import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const migration = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20260828183715_products_v2_media_and_matching.sql", import.meta.url)),
  "utf8",
);
const matchingReviewMigration = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20260829005749_image_matching_pilot_review_status.sql", import.meta.url)),
  "utf8",
);
const externalPublicationMigration = readFileSync(
  fileURLToPath(new URL("../supabase/migrations/20260829033000_publish_approved_external_candidate.sql", import.meta.url)),
  "utf8",
);
const adminStore = readFileSync(
  fileURLToPath(new URL("../lib/server/admin/runia-admin-store.ts", import.meta.url)),
  "utf8",
);
const imageQueuePage = readFileSync(
  fileURLToPath(new URL("../app/admin/(protected)/imagenes/page.tsx", import.meta.url)),
  "utf8",
);
const imageQueue = readFileSync(
  fileURLToPath(new URL("../app/admin/(protected)/imagenes/ImageCandidateQueue.tsx", import.meta.url)),
  "utf8",
);
const adminActions = readFileSync(
  fileURLToPath(new URL("../app/admin/actions.ts", import.meta.url)),
  "utf8",
);
const pilot = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("../docs/image-matching-pilot-2026-08-28.json", import.meta.url)),
    "utf8",
  ),
) as {
  products: Array<{
    sku: string;
    imageUrl?: string;
    confidence?: number;
    sourceTier?: string;
    discardedFalsePositives?: number;
  }>;
};

test("Productos V2 separa verdad VINROS de editorial Lombardo", () => {
  assert.match(migration, /create table public\.supplier_product_editorial/);
  assert.match(migration, /supplier_product_id uuid primary key references public\.supplier_products/);
  assert.doesNotMatch(migration, /update public\.supplier_prices/);
  assert.doesNotMatch(migration, /delete from public\.supplier_prices/);
});

test("la ficha consulta el nombre real de la marca temporal de última presencia", () => {
  assert.match(adminStore, /source_raw,last_seen_at,retail_prices/);
  assert.match(adminStore, /lastSeen: row\.last_seen_at/);
  assert.doesNotMatch(adminStore, /source_raw,last_seen,retail_prices/);
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

test("matching y publicación nunca ocurren sin una decisión humana explícita", () => {
  assert.match(
    matchingReviewMigration,
    /alter table public\.external_image_candidates[\s\S]*add column match_review_status text not null default 'pending'/,
  );
  assert.match(
    matchingReviewMigration,
    /external_image_candidates_match_review_status_check[\s\S]*'pending', 'approved', 'rejected'/,
  );
  assert.match(
    migration,
    /external_image_candidates_publish_check[\s\S]*approval_status <> 'approved' or rights_status in \('licensed', 'approved'\)/,
  );
  const reviewMethod = adminStore.match(
    /async reviewImageCandidate\([\s\S]*?\n  }\n\n  async listCustomers/,
  )?.[0] || "";
  assert.match(reviewMethod, /match_review_status: status/);
  assert.match(reviewMethod, /reviewed_by: reviewerId/);
  assert.doesNotMatch(reviewMethod, /approval_status:|rights_status:/);
  assert.match(imageQueuePage, /SIN APROBACIÓN AUTOMÁTICA/);
  assert.match(imageQueue, /APROBAR SELECCIONADOS/);
  assert.match(imageQueue, /bulkReviewImageCandidatesAction/);
  assert.match(adminActions, /reviewImageCandidate\(id, "approved", session\.authUserId\)[\s\S]*publishApprovedImageCandidate\(id, session\.authUserId\)/);
});

test("seleccionar HIGH visibles excluye MEDIUM y los filtros se ejecutan server-side", () => {
  assert.match(imageQueue, /filter\(\(candidate\) => candidate\.confidenceBand === "high"\)/);
  assert.match(imageQueue, /setSelected\(new Set\(highIds\)\)/);
  assert.match(imageQueuePage, /confidenceBand: confidence/);
  assert.match(adminStore, /input\.confidenceBand === "high"[\s\S]*match_confidence", "gte\.0\.9"/);
  assert.match(adminStore, /input\.confidenceBand === "medium"[\s\S]*"gte\.0\.72"[\s\S]*"lt\.0\.9"/);
});

test("sólo un match humano aprobado puede convertirse en media pública externa", () => {
  assert.match(externalPublicationMigration, /match_review_status <> 'approved'/);
  assert.match(externalPublicationMigration, /eligibility_status <> 'safe'/);
  assert.match(externalPublicationMigration, /'external_approved',v_candidate\.source_url,'approved','approved'/);
  assert.match(externalPublicationMigration, /revoke all on function[\s\S]*from public, anon, authenticated/);
  assert.match(adminStore, /assertPublicHttpsUrl/);
  assert.match(adminStore, /privateAddress/);
  assert.match(adminStore, /supplier_publish_external_candidate/);
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

test("piloto mantiene 25 productos, 22 candidatos y cero publicación implícita", () => {
  const candidates = pilot.products.filter((product) => product.imageUrl);
  assert.equal(pilot.products.length, 25);
  assert.equal(new Set(pilot.products.map((product) => product.sku)).size, 25);
  assert.equal(candidates.length, 22);
  assert.equal(candidates.filter((product) => (product.confidence || 0) >= 0.9).length, 20);
  assert.equal(candidates.filter((product) => (product.confidence || 0) >= 0.72 && (product.confidence || 0) < 0.9).length, 2);
  assert.equal(candidates.filter((product) => product.sourceTier === "official").length, 6);
  assert.equal(
    pilot.products.reduce((total, product) => total + (product.discardedFalsePositives || 0), 0),
    5,
  );
  assert.equal(
    pilot.products.some((product) => "approvalStatus" in product || "rightsStatus" in product),
    false,
  );
});
