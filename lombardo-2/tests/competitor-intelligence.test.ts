import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildCompetitorMatcher, priceDifference } from "../lib/competitors/matcher.ts";
import {
  parsePositanoCatalogPage,
  robotsAllowsProducts,
} from "../lib/competitors/positano-parser.ts";
import type { ExternalCompetitorProduct } from "../lib/competitors/types.ts";
import { PositanoCatalogSource } from "../lib/server/competitors/positano-source.ts";

const POSITANO_PAGE = String.raw`
<script>
const initialState = { page: { data: { products: [
  {
    id: 306474697,
    attributes: null,
    brand: "RUTINI",
    canonical_url: "https:\/\/www.positanovinos.com.ar\/productos\/trumpeter-malbec-x-750-cc\/",
    name: { "es": "TRUMPETER\u0020MALBEC\u0020X\u0020750\u0020CC" },
    variants: [{
      id: 1362387878,
      barcode: "7790577001234",
      compare_at_price: "10800.00",
      has_promotional_price: true,
      promotional_price: "9775.00",
      price: "9775.00",
      product_id: 306474697,
      sku: "TRU-MAL-750",
      stock: 23,
      stock_management: true,
      values: [{ "es": "MALBEC" }],
    }],
  },
] } } };
</script>
<a href="/productos/page/2/">2</a><a href="/productos/page/9/">9</a>`;

function external(overrides: Partial<ExternalCompetitorProduct> = {}): ExternalCompetitorProduct {
  return {
    externalId: "306474697:1362387878",
    externalProductUrl: "https://www.positanovinos.com.ar/productos/trumpeter-malbec-x-750-cc/",
    externalName: "TRUMPETER MALBEC X 750 CC",
    brand: "RUTINI",
    presentation: "750 ml",
    currentPrice: 9_775,
    available: true,
    fetchedAt: "2026-08-30T15:00:00.000Z",
    raw: {},
    ...overrides,
  };
}

test("parser Positano captura URL, precio, lista, promoción, SKU, EAN y paginación", () => {
  const parsed = parsePositanoCatalogPage(POSITANO_PAGE, "2026-08-30T15:00:00.000Z");
  assert.equal(parsed.objectsDetected, 1);
  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.pagesDiscovered, 9);
  assert.match(parsed.structuralSignature, /^[a-f0-9]{64}$/);
  assert.deepEqual(parsed.products[0], {
    externalId: "306474697:1362387878",
    externalProductUrl: "https://www.positanovinos.com.ar/productos/trumpeter-malbec-x-750-cc/",
    externalName: "TRUMPETER MALBEC X 750 CC",
    brand: "RUTINI",
    presentation: "MALBEC",
    ean: "7790577001234",
    externalSku: "TRU-MAL-750",
    currentPrice: 9_775,
    listPrice: 10_800,
    promotionText: "9% OFF",
    available: true,
    fetchedAt: "2026-08-30T15:00:00.000Z",
    raw: {
      productId: 306474697,
      variantId: 1362387878,
      variantIndex: 0,
      stock: 23,
      stockManaged: true,
      values: ["MALBEC"],
    },
  });
});

test("firma estructural ignora cambios de precio y contenido", () => {
  const first = parsePositanoCatalogPage(POSITANO_PAGE, "2026-08-30T15:00:00.000Z");
  const changed = parsePositanoCatalogPage(
    POSITANO_PAGE.replaceAll("9775.00", "9999.00").replace("TRUMPETER", "TRUMPETER RESERVE"),
    "2026-08-31T15:00:00.000Z",
  );
  assert.equal(first.structuralSignature, changed.structuralSignature);
});

test("robots permite catálogo público y bloquea cuando /productos está prohibido", () => {
  assert.equal(robotsAllowsProducts("User-agent: *\nDisallow: /checkout/\nDisallow: /account/"), true);
  assert.equal(robotsAllowsProducts("User-agent: *\nDisallow: /productos/"), false);
});

function sourcePage(page: number, next?: number) {
  const products = Array.from({ length: 10 }, (_, index) => {
    const id = (page * 100) + index;
    return `{id:${id},brand:"BODEGA",canonical_url:"https://www.positanovinos.com.ar/productos/producto-${id}/",name:{"es":"PRODUCTO ${id} X 750 CC"},variants:[{id:${id + 10_000},price:"${10_000 + id}.00",sku:"POS-${id}",stock_management:false,values:[]}]}`;
  }).join(",");
  return `<script>const state={products:[${products}]};</script>${next ? `<a href="/productos/page/${next}/">SIGUIENTE</a>` : ""}`;
}

test("fuente Positano sigue paginación incremental hasta el final sin superar el límite", async () => {
  const requested: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    requested.push(new URL(url).pathname);
    const body = url.endsWith("/robots.txt")
      ? "User-agent: *\nDisallow: /checkout/"
      : url.endsWith("/productos/")
        ? sourcePage(1, 2)
        : url.includes("/page/2/")
          ? sourcePage(2, 3)
          : sourcePage(3);
    const response = new Response(body, { status: 200 });
    Object.defineProperty(response, "url", { value: url });
    return response;
  }) as typeof fetch;
  const result = await new PositanoCatalogSource({ fetcher, crawlDelayMs: 250, maximumPages: 3 }).scrape();
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.products.length, 30);
  assert.deepEqual(requested, ["/robots.txt", "/productos/", "/productos/page/2/", "/productos/page/3/"]);
});

test("matcher asigna HIGH por identidad completa y no confunde varietal o volumen", () => {
  const match = buildCompetitorMatcher([
    {
      id: "runia-malbec",
      sku: "VIN001",
      name: "TRUMPETER MALBEC X 750 CC",
      presentation: "750 ml",
      brand: "RUTINI",
      category: "vinos",
      retailPrice: 10_500,
    },
    {
      id: "runia-cabernet",
      sku: "VIN002",
      name: "TRUMPETER CABERNET SAUVIGNON X 750 CC",
      presentation: "750 ml",
      brand: "RUTINI",
      category: "vinos",
      retailPrice: 10_500,
    },
  ])(external());
  assert.equal(match.runiaProductId, "runia-malbec");
  assert.equal(match.band, "high");
  assert.equal(match.conflicts.length, 0);
});

test("EAN exacto prevalece y los conflictos explícitos quedan auditados", () => {
  const match = buildCompetitorMatcher([
    {
      id: "runia-ean",
      sku: "VIN003",
      ean: "7790577001234",
      name: "TRUMPETER MALBEC X 750 CC",
      presentation: "750 ml",
      brand: "RUTINI",
      retailPrice: 10_500,
    },
  ])(external({ ean: "7790577001234", externalName: "Nombre abreviado" }));
  assert.equal(match.runiaProductId, "runia-ean");
  assert.equal(match.band, "high");
  assert.ok(match.matchedFields.includes("EAN exacto"));
});

test("diferencia positiva significa que Lombardo está más caro", () => {
  assert.deepEqual(priceDifference(11_000, 10_000), { amount: 1_000, percentage: 10 });
  assert.deepEqual(priceDifference(9_000, 10_000), { amount: -1_000, percentage: -10 });
});

test("schema competitivo es privado, auditable y no puede escribir precios Runia", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260830133000_competitor_intelligence_v1.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "competitors",
    "competitor_runs",
    "competitor_products",
    "competitor_product_matches",
    "competitor_price_history",
    "competitor_match_history",
    "competitor_alert_rules",
    "competitor_alert_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
  }
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /manual_override/i);
  assert.match(migration, /cooldown_hours/i);
  assert.doesNotMatch(migration, /(insert\s+into|update|delete\s+from)\s+public\.supplier_prices/i);
  assert.doesNotMatch(migration, /grant[^;]*to\s+(anon|authenticated)/i);
});

test("scheduler ejecuta competencia después del orquestador existente", async () => {
  const route = await readFile(
    new URL("../app/api/cron/daily-automations/route.ts", import.meta.url),
    "utf8",
  );
  const existing = route.indexOf('orchestrator.runDaily("schedule")');
  const competitor = route.indexOf('service.run({ trigger: "schedule" })');
  assert.ok(existing >= 0 && competitor > existing);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /maxDuration = 300/);
});
