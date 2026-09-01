import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260901135755_fuzzy_product_search.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
const adminStore = readFileSync(
  fileURLToPath(new URL("../lib/server/admin/runia-admin-store.ts", import.meta.url)),
  "utf8",
);
const adminSearch = readFileSync(
  fileURLToPath(
    new URL("../components/admin/AdminDynamicProductSearch.tsx", import.meta.url),
  ),
  "utf8",
);

const PRODUCT_ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";

test("el índice de búsqueda incluye marca, presentación y tolerancia acotada", () => {
  assert.match(migration, /add column search_document text not null/);
  assert.match(migration, /editorial\.brand_name/);
  assert.match(migration, /normalized_presentation/);
  assert.match(migration, /using gin \(search_document extensions\.gin_trgm_ops\)/);
  assert.match(migration, /levenshtein_less_equal/);
  assert.match(migration, /matched\.word_score >= 0\.25/);
  assert.match(migration, /having count\(\*\) = token_count\.value/);
});

test("la búsqueda fuzzy queda server-only y Admin no carga el catálogo completo", () => {
  assert.match(migration, /grant execute on function public\.supplier_search_product_ids[\s\S]*to service_role/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(adminStore, /rpc\/supplier_search_product_ids/);
  assert.match(adminStore, /p_limit: input\.limit/);
  assert.doesNotMatch(adminStore, /normalized_name\.ilike\.\*\$\{term\}/);
});

test("Productos Admin busca mientras se escribe y reinicia la paginación", () => {
  assert.match(adminSearch, /setTimeout\([\s\S]*300/);
  assert.match(adminSearch, /router\.replace/);
  assert.match(adminSearch, /next\.delete\("offset"\)/);
});

test("el catálogo usa términos en cualquier orden mediante la RPC común", async () => {
  let body: Record<string, unknown> | undefined;
  const provider = new RuniaCommerceProvider({
    url: "https://example.supabase.co",
    secretKey: "sb_secret_test_value_123456789",
    tenantSlug: "lombardo",
    fetcher: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith("/suppliers")) {
        return Response.json([
          {
            id: SUPPLIER_ID,
            name: "VINROS",
            active: true,
            tenants: { slug: "lombardo", status: "active" },
          },
        ]);
      }
      if (url.pathname.endsWith("/rpc/supplier_search_product_ids")) {
        body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Response.json([
          { product_id: PRODUCT_ID, search_rank: 7, total_count: 1 },
        ]);
      }
      if (url.pathname.endsWith("/supplier_product_public_media")) {
        return Response.json([]);
      }
      return Response.json([
        {
          runia_product_id: PRODUCT_ID,
          supplier_sku: "RUT150B",
          name_raw: "DOMINIO RUTINI V Malbec x 750cc",
          presentation_raw: "750cc",
          normalized_presentation: "750 ml",
          active: true,
          eligibility_status: "safe",
          retail_prices: [{ price_type: "retail", current_price: 26_701 }],
          editorial: [{ brand_name: "Rutini" }],
        },
      ]);
    },
  });

  const page = await provider.getProductPage({ search: "MALBEC RUTINI" });
  assert.equal(body?.p_query, "malbec rutini");
  assert.equal(body?.p_eligibility, "safe");
  assert.equal(body?.p_active_only, true);
  assert.equal(page.products[0]?.sku, "RUT150B");
  assert.equal(page.total, 1);
});
