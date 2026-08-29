import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { RuniaCommerceProvider } from "../lib/commerce/runia-commerce-provider.ts";
import { SEO_CATEGORIES } from "../lib/seo/categories.ts";
import {
  FEATURED_GUIDES,
  PUBLISHED_GUIDES,
  hasGuideQuality,
} from "../lib/seo/guides.ts";
import {
  onlineStoreStructuredData,
  productStructuredData,
  serializeJsonLd,
} from "../lib/seo/structured-data.ts";
import type { Product } from "../types/commerce.ts";

const root = fileURLToPath(new URL("..", import.meta.url));

function source(path: string) {
  return readFileSync(`${root}/${path}`, "utf8");
}

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: "7b0961f2-3dbf-4875-9f37-20c9eb9e1310",
    sourceProductId: "7b0961f2-3dbf-4875-9f37-20c9eb9e1310",
    sku: "VIN001",
    slug: "vino-prueba--7b0961f2-3dbf-4875-9f37-20c9eb9e1310",
    name: "Vino Prueba",
    description: "",
    presentation: "750 ml",
    brand: { id: "marca", slug: "marca", name: "Marca" },
    category: { id: "vinos", slug: "vinos", name: "Vinos" },
    price: 15_000,
    basePrice: 15_000,
    priceType: "retail",
    pricingPolicy: "RETAIL",
    discountPercent: 0,
    pricingContextKey: "retail",
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images: [
      {
        id: "image",
        src: "https://example.com/vino.jpg",
        alt: "Botella de Vino Prueba",
      },
    ],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
    ...overrides,
  };
}

test("SEO publica categorías reales y sólo guías editoriales con control de calidad", () => {
  assert.deepEqual(
    SEO_CATEGORIES.map((category) => category.slug),
    ["vinos", "destilados", "cervezas", "sin-alcohol", "gourmet", "regalos"],
  );
  assert.equal(FEATURED_GUIDES.length, 5);
  assert.equal(PUBLISHED_GUIDES.length, 7);
  for (const guide of PUBLISHED_GUIDES) {
    assert.equal(hasGuideQuality(guide, guide.catalog.limit), true);
    assert.equal(hasGuideQuality(guide, guide.catalog.limit - 1), false);
  }
});

test("las cinco piezas editoriales tienen metadatos, lectura, visuales y catálogo vivo", () => {
  assert.deepEqual(
    FEATURED_GUIDES.map((guide) => guide.slug),
    [
      "que-vino-llevar-a-una-cena",
      "vinos-por-menos-de-20000",
      "malbec-7-botellas-para-entenderlo",
      "regalar-vino-sin-saber-de-vino",
      "vino-para-asado-no-siempre-malbec",
    ],
  );
  for (const guide of FEATURED_GUIDES) {
    assert.equal(guide.sections.length, 4);
    assert.equal(guide.visualCaptions.length, 2);
    assert.ok(guide.readingMinutes >= 5);
    assert.equal(guide.publishedAt, "2026-08-29");
  }
  const priceGuide = FEATURED_GUIDES.find((guide) => guide.slug === "vinos-por-menos-de-20000");
  assert.equal(priceGuide?.catalog.mode, "price-cap");
  assert.equal(priceGuide?.catalog.priceMax, 20_000);
  assert.equal(priceGuide?.catalog.limit, 10);
});

test("guías publican Article schema, OG propia, enlaces bidireccionales y eventos editoriales", () => {
  const article = source("app/guias/[slug]/page.tsx");
  const products = source("components/guides/GuideProductGrid.tsx");
  const events = source("lib/analytics/commerce-events.ts");
  assert.match(article, /articleStructuredData/);
  assert.match(source("app/guias/[slug]/opengraph-image.tsx"), /ImageResponse/);
  assert.match(source("app/productos/[slug]/page.tsx"), /ProductGuideLinks/);
  assert.match(source("app/page.tsx"), /HomeGuides/);
  assert.match(products, /guide_product_click/);
  assert.match(products, /guide_add_to_cart/);
  for (const event of ["guide_view", "guide_product_click", "guide_add_to_cart", "guide_share", "guide_related_click"]) {
    assert.match(events, new RegExp(event));
  }
});

test("Organization usa OnlineStore y Product refleja precio y disponibilidad visibles", () => {
  const store = onlineStoreStructuredData();
  assert.equal(store["@type"], "OnlineStore");
  assert.equal(store.areaServed.name, "Rosario");
  assert.equal("address" in store, false);

  const schema = productStructuredData(product());
  assert.equal(schema["@type"], "Product");
  assert.equal(schema.offers.priceCurrency, "ARS");
  assert.equal(schema.offers.price, 15_000);
  assert.equal(schema.offers.availability, "https://schema.org/PreOrder");
  assert.deepEqual(schema.image, ["https://example.com/vino.jpg"]);
});

test("JSON-LD escapa HTML para no convertir datos del catálogo en markup ejecutable", () => {
  assert.equal(
    serializeJsonLd({ name: "</script><script>alert(1)</script>" }).includes("<"),
    false,
  );
});

test("sitemap usa el índice liviano de productos e incorpora categorías y guías", () => {
  const sitemap = source("app/sitemap.ts");
  assert.match(sitemap, /getIndexableProducts/);
  assert.match(sitemap, /SEO_CATEGORIES/);
  assert.match(sitemap, /PUBLISHED_GUIDES/);
  assert.match(sitemap, /\/productos\/\$\{product\.slug\}/);
});

test("navegación interna deja de crear facetas por query y enlaza categorías canónicas", () => {
  const files = [
    "components/layout/Header.tsx",
    "components/home/CommercialDiscovery.tsx",
    "components/home/FirstAct.tsx",
    "components/catalog/CatalogExplorer.tsx",
  ];
  const navigation = files.map(source).join("\n");
  assert.doesNotMatch(navigation, /productos\?categoria=/);
  assert.match(navigation, /\/categorias\/vinos/);
  assert.match(navigation, /\/categorias\/\$\{item\.slug\}/);
  assert.match(source("proxy.ts"), /"\/categorias\/:path\*"/);
  assert.match(source("proxy.ts"), /"\/guias\/:path\*"/);
});

test("legacy URLs críticas tienen redirect permanente a destinos equivalentes", () => {
  const config = source("next.config.ts");
  for (const legacy of [
    "/pages/home",
    "/pages/tienda",
    "/wine-tinder.html",
    "/tinder-wine.html",
    "/pages/wine-tinder",
    "/wine-tinder",
    "/pasteleria",
    "/pages/pasteleria",
  ]) {
    assert.match(config, new RegExp(legacy.replaceAll("/", "\\/")));
  }
  assert.match(config, /permanent: true/);
});

test("lector SEO pagina productos SAFE con lista retail sin cargar imágenes", async () => {
  const productRows = [
    {
      runia_product_id: "7b0961f2-3dbf-4875-9f37-20c9eb9e1310",
      supplier_sku: "VIN001",
      name_raw: "Malbec Único",
    },
    {
      runia_product_id: "8c1961f2-3dbf-4875-9f37-20c9eb9e1311",
      supplier_sku: "WI001",
      name_raw: "Whisky Único",
    },
  ];
  const requests: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    requests.push(url);
    if (url.includes("/suppliers?")) {
      return Response.json([
        {
          id: "supplier",
          name: "VINROS",
          active: true,
          tenants: { slug: "lombardo", status: "active" },
        },
      ]);
    }
    return Response.json(productRows);
  };
  const provider = new RuniaCommerceProvider({
    url: "https://runia.example",
    secretKey: "sb_secret_test",
    tenantSlug: "lombardo",
    fetcher,
  });

  const indexable = await provider.getIndexableProducts();
  assert.equal(indexable.length, 2);
  assert.match(indexable[0]?.slug ?? "", /^malbec-unico--/);
  assert.equal(indexable[0]?.categorySlug, "vinos");
  assert.equal(indexable[1]?.categorySlug, "destilados");

  const query = decodeURIComponent(requests.at(-1) ?? "");
  assert.match(query, /eligibility_status=eq.safe/);
  assert.match(query, /active=is.true/);
  assert.match(query, /retail_prices.price_type=eq.retail/);
  assert.doesNotMatch(query, /supplier_product_public_media/);
});
