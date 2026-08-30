import { readFile, writeFile } from "node:fs/promises";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import {
  bestPublicCatalogMatch,
  comparePublicCatalogImage,
  normalizeImageMatchText,
  reviewRiskForMatch,
  visualVariantForSku,
  type ImageMatchProduct,
  type ImageMatchResult,
  type ImageSourceTier,
  type PublicCatalogImage,
} from "../lib/images/mass-image-matcher.ts";

interface SourceDefinition {
  key: string;
  tier: ImageSourceTier;
  sitemapUrl: string;
  productPath: RegExp;
  listingPages?: number;
}

interface SitemapRecord extends PublicCatalogImage {
  requiresPageFetch: boolean;
}

interface SearchCacheRecord {
  productId: string;
  external?: PublicCatalogImage;
  confidence: number;
  band: ImageMatchResult["band"];
  exact: boolean;
  matchedFields: string[];
  hardConflicts: string[];
  needsReview: boolean;
}

interface PriorCandidate {
  id: string;
  productId: string;
  productName: string;
  source: string;
  sourceUrl: string;
  imageUrl: string;
}

const SOURCES: SourceDefinition[] = [
  { key: "positano", tier: "positano", sitemapUrl: "https://www.positanovinos.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "official_luigi_bosca", tier: "official", sitemapUrl: "https://tienda.luigibosca.com/sitemap.xml", productPath: /\/p(?:\?|$)/i },
  { key: "official_rutini", tier: "official", sitemapUrl: "https://tienda.rutiniwines.com/sitemap.xml", productPath: /\/products\//i },
  { key: "official_norton", tier: "official", sitemapUrl: "https://shop.norton.com.ar/sitemap.xml", productPath: /\/products\//i },
  { key: "official_alfredo_roca", tier: "official", sitemapUrl: "https://tienda-rocawines.com/sitemap.xml", productPath: /\/products\//i },
  { key: "distributor_tonel_privado", tier: "distributor", sitemapUrl: "https://www.tonelprivado.com/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_ligier", tier: "distributor", sitemapUrl: "https://www.ligier.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_distribebidas", tier: "distributor", sitemapUrl: "https://www.distribebidaslp.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_bebiendo_estrellas", tier: "distributor", sitemapUrl: "https://www.bebiendoestrellas.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_mercado_bebidas", tier: "distributor", sitemapUrl: "https://www.elmercadodebebidas.com.ar/sitemap.xml", productPath: /\/shop\//i },
  { key: "distributor_casa_catar", tier: "distributor", sitemapUrl: "https://casacatar.com/sitemap.xml", productPath: /\/products\//i },
  { key: "distributor_bonvino", tier: "distributor", sitemapUrl: "https://www.bonvino.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_musters", tier: "distributor", sitemapUrl: "https://musters.com.ar/sitemap_index.xml", productPath: /\/producto\//i },
  { key: "distributor_debarricas", tier: "distributor", sitemapUrl: "https://debarricas.com.ar/sitemap_index.xml", productPath: /\/producto\//i },
  { key: "distributor_black_bebidas", tier: "distributor", sitemapUrl: "https://blackbebidas.com.ar/wp-sitemap.xml", productPath: /\/producto\//i },
  { key: "distributor_espacio_vino", tier: "distributor", sitemapUrl: "https://www.espaciovino.com.ar/vinos?o=recomendados", productPath: /\/vinos-ficha\//i, listingPages: 98 },
  { key: "distributor_vinicius", tier: "distributor", sitemapUrl: "https://viniciusvinos.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "distributor_quirino", tier: "distributor", sitemapUrl: "https://quirinobebidas.com.ar/sitemap_index.xml", productPath: /\/producto\//i },
  { key: "commercial_megawine", tier: "commercial", sitemapUrl: "https://www.megawine.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "commercial_tienda_de_vinos", tier: "commercial", sitemapUrl: "https://tiendadevinos.ar/sitemap_index.xml", productPath: /^https:\/\/tiendadevinos[.]ar\/(?!venta\/?$)/i },
  { key: "commercial_lavinoteca_lanus", tier: "commercial", sitemapUrl: "https://lavinotecalanus.mitiendanube.com/sitemap.xml", productPath: /\/productos\//i },
  { key: "commercial_boncic", tier: "commercial", sitemapUrl: "https://boncic.com/sitemap.xml", productPath: /\/productos\//i },
  { key: "commercial_vinos_padua", tier: "commercial", sitemapUrl: "https://vinospadua.com.ar/sitemap.xml", productPath: /\/productos\//i },
  { key: "commercial_gran_reserva", tier: "commercial", sitemapUrl: "https://granreserva.com.ar/sitemap_index.xml", productPath: /\/producto\//i },
  { key: "commercial_jumbo", tier: "commercial", sitemapUrl: "https://www.jumbo.com.ar/sitemap.xml", productPath: /\/p(?:\?|$)/i },
  { key: "commercial_disco", tier: "commercial", sitemapUrl: "https://www.disco.com.ar/sitemap.xml", productPath: /\/p(?:\?|$)/i },
  { key: "commercial_vea", tier: "commercial", sitemapUrl: "https://www.vea.com.ar/sitemap.xml", productPath: /\/p(?:\?|$)/i },
  { key: "commercial_carrefour", tier: "commercial", sitemapUrl: "https://www.carrefour.com.ar/sitemap.xml", productPath: /\/p(?:\?|$)/i },
  { key: "commercial_mas_online", tier: "commercial", sitemapUrl: "https://www.masonline.com.ar/sitemap.xml", productPath: /\/p(?:\?|$)/i },
];

const mode = process.env.MASS_IMAGE_RUN_MODE === "execute" ? "execute" : "dry-run";
const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const token = process.env.IMAGE_JOB_TOKEN || "";
const confirmation = process.env.MASS_IMAGE_RUN_CONFIRM;
const searchCachePath = process.env.MASS_IMAGE_SEARCH_CACHE_PATH || "docs/mass-image-search-cache-phase2-2026-08-29.json";
const searchFallbackLimit = Number.parseInt(process.env.MASS_IMAGE_SEARCH_LIMIT || "0", 10);
const searchDisabled = process.env.MASS_IMAGE_DISABLE_SEARCH === "1";
const duckSearchEnabled = process.env.MASS_IMAGE_ENABLE_DDG === "1";
const runId = `mass-image-coverage-phase2-${new Date().toISOString().slice(0, 10)}`;
const expectedPhase2Products = 1_633;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const execFile = promisify(execFileCallback);

if (!baseUrl.startsWith("https://") || !uuidPattern.test(jobId) || token.length < 43) {
  throw new Error("Configuración incompleta para el trabajo protegido de imágenes.");
}
if (mode === "execute" && confirmation !== "RUN_PHASE2_ONCE_APPROVED_2026_08_29") {
  throw new Error("La única corrida Phase 2 requiere la confirmación aprobada.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(15_000) });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await delay(600 * (attempt + 1));
  }
  throw lastError instanceof Error ? lastError : new Error("La solicitud no pudo completarse.");
}

function jobRequest(path: string, init: RequestInit = {}) {
  return fetchWithRetry(`${baseUrl}/api/admin/image-jobs/${jobId}/publish${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
}

async function loadProducts() {
  const products: ImageMatchProduct[] = [];
  let offset = 0;
  while (true) {
    const response = await jobRequest(`?offset=${offset}&limit=100`);
    if (!response.ok) throw new Error(`No se pudo leer el catálogo SAFE: HTTP ${response.status}.`);
    const page = await response.json() as { products: ImageMatchProduct[]; hasMore: boolean; limit: number };
    products.push(...page.products);
    if (!page.hasMore || !page.products.length) break;
    offset += page.limit;
  }
  return products;
}

async function loadPriorCandidates(queue: "published" | "rejected") {
  const candidates: PriorCandidate[] = [];
  let offset = 0;
  while (true) {
    const response = await jobRequest(`?queue=${queue}&offset=${offset}&limit=100`);
    if (!response.ok) throw new Error(`No se pudo leer la cola ${queue}: HTTP ${response.status}.`);
    const page = await response.json() as { candidates: PriorCandidate[]; hasMore: boolean; limit: number };
    candidates.push(...page.candidates);
    if (!page.hasMore || !page.candidates.length) break;
    offset += page.limit;
  }
  return candidates;
}

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function decodeHtml(value: string) {
  return decodeXml(value)
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block: string, name: string) {
  const match = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return match ? decodeXml(match[1].trim()) : "";
}

function pageName(sourceUrl: string, imageTitle = "") {
  if (imageTitle.trim()) return imageTitle.trim();
  const url = new URL(sourceUrl);
  const path = url.pathname.replace(/\/$/, "");
  const segments = path.split("/").filter(Boolean);
  const slug = segments.at(-1)?.toLocaleLowerCase("en-US") === "p"
    ? segments.at(-2) || ""
    : segments.at(-1) || "";
  return decodeURIComponent(slug)
    .replace(/--cm[a-z0-9]+$/i, "")
    .replace(/-[0-9a-f]{8}$/i, "")
    .replace(/-be\d+$/i, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

const INDEX_STOP_WORDS = new Set([
  "vino", "vinos", "bebida", "bebidas", "botella", "botellas", "unidad", "unidades",
  "unid", "de", "del", "la", "las", "el", "los", "con", "sin", "para", "pack", "caja",
]);

function distinctiveToken(value: string) {
  return normalizeImageMatchText(value).split(" ")
    .find((token) => token.length > 1 && !INDEX_STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function catalogIndex(products: SitemapRecord[]) {
  const index = new Map<string, SitemapRecord[]>();
  for (const product of products) {
    const tokens = new Set(normalizeImageMatchText(product.name).split(" ")
      .filter((token) => token.length > 1 && !INDEX_STOP_WORDS.has(token)));
    for (const token of tokens) {
      const values = index.get(token) ?? [];
      values.push(product);
      index.set(token, values);
    }
  }
  return index;
}

function sitemapChildren(xml: string) {
  return [...xml.matchAll(/<sitemap(?:\s[^>]*)?>([\s\S]*?)<\/sitemap>/gi)]
    .map((match) => tag(match[1], "loc"))
    .filter((url) => url.startsWith("https://"));
}

function sitemapProducts(xml: string, source: SourceDefinition, relevantTokens: Set<string>) {
  const products: SitemapRecord[] = [];
  for (const match of xml.matchAll(/<url(?:\s[^>]*)?>([\s\S]*?)<\/url>/gi)) {
    const block = match[1];
    const sourceUrl = tag(block, "loc");
    if (!sourceUrl.startsWith("https://") || !source.productPath.test(sourceUrl)) continue;
    const imageUrl = tag(block, "image:loc");
    const imageTitle = tag(block, "image:title");
    const name = pageName(sourceUrl, imageTitle);
    const tokens = normalizeImageMatchText(name).split(" ");
    if (!tokens.some((token) => relevantTokens.has(token))) continue;
    products.push({
      key: sourceUrl,
      source: source.key,
      tier: source.tier,
      sourceUrl,
      imageUrl,
      name,
      requiresPageFetch: !imageUrl.startsWith("https://"),
    });
  }
  return products;
}

async function loadSourceCatalog(source: SourceDefinition, relevantTokens: Set<string>) {
  if (source.listingPages) {
    const pages = await mapLimit(Array.from({ length: source.listingPages }, (_, index) => index + 1), 4, async (page) => {
      const response = await fetchWithRetry(`${source.sitemapUrl}&page=${page}`, {
        headers: { "User-Agent": "LombardoCatalogCoverage/1.0", Accept: "text/html" },
      });
      if (!response.ok) return [];
      const html = await response.text();
      const records: SitemapRecord[] = [];
      for (const match of html.matchAll(/<a[^>]+href=["']([^"']*\/vinos-ficha\/[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
        const image = match[2].match(/<img[^>]+>/i)?.[0] || "";
        const sourceUrl = new URL(decodeHtml(match[1]), "https://www.espaciovino.com.ar").href;
        const name = decodeHtml(image.match(/alt=["']([^"']+)["']/i)?.[1] || pageName(sourceUrl));
        const tokens = normalizeImageMatchText(name).split(" ");
        if (!tokens.some((token) => relevantTokens.has(token))) continue;
        const rawImage = image.match(/data-src=["']([^"']+)["']/i)?.[1] || image.match(/src=["']([^"']+)["']/i)?.[1] || "";
        const imageUrl = rawImage
          ? new URL(decodeHtml(rawImage).replace(/_small(?=[.])/i, "_medium"), "https://www.espaciovino.com.ar").href
          : "";
        records.push({
          key: sourceUrl,
          source: source.key,
          tier: source.tier,
          sourceUrl,
          imageUrl,
          name,
          requiresPageFetch: false,
        });
      }
      return records;
    });
    return [...new Map(pages.flat().map((record) => [record.sourceUrl, record])).values()];
  }
  const queue = [{ url: source.sitemapUrl, depth: 0 }];
  const visited = new Set<string>();
  const products = new Map<string, SitemapRecord>();
  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current.url) || current.depth > 2) continue;
    visited.add(current.url);
    const response = await fetchWithRetry(current.url, {
      headers: { "User-Agent": "LombardoCatalogCoverage/1.0", Accept: "application/xml,text/xml" },
    });
    const xml = await response.text();
    if (!response.ok && !/<(?:urlset|sitemapindex)(?:\s|>)/i.test(xml)) continue;
    for (const product of sitemapProducts(xml, source, relevantTokens)) products.set(product.sourceUrl, product);
    const children = sitemapChildren(xml)
      .filter((url) => /product|producto/i.test(url));
    queue.push(...children.map((url) => ({ url, depth: current.depth + 1 })));
  }
  return [...products.values()];
}

function jsonLdProducts(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(jsonLdProducts);
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const nested = Object.values(record).flatMap(jsonLdProducts);
  const type = record["@type"];
  return (type === "Product" || (Array.isArray(type) && type.includes("Product"))) ? [record, ...nested] : nested;
}

function firstHttpsImage(value: unknown): string {
  if (typeof value === "string" && value.startsWith("https://")) return value;
  if (Array.isArray(value)) return value.map(firstHttpsImage).find(Boolean) || "";
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return firstHttpsImage(record.url) || firstHttpsImage(record.contentUrl);
  }
  return "";
}

async function enrichFromProductPage(record: SitemapRecord) {
  if (!record.requiresPageFetch) return record;
  const response = await fetchWithRetry(record.sourceUrl, {
    headers: { "User-Agent": "LombardoCatalogCoverage/1.0", Accept: "text/html" },
  });
  if (!response.ok) return record;
  const html = await response.text();
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const products = jsonLdProducts(JSON.parse(match[1]));
      for (const product of products) {
        const imageUrl = firstHttpsImage(product.image);
        if (imageUrl) {
          return { ...record, imageUrl, name: typeof product.name === "string" ? product.name : record.name, requiresPageFetch: false };
        }
      }
    } catch {
      // A malformed third-party JSON-LD block does not invalidate the source page.
    }
  }
  const imageUrl = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)?.[1]
    || "";
  const title = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
    || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]
    || record.name;
  return {
    ...record,
    imageUrl: decodeXml(imageUrl),
    name: decodeXml(title).split(/\s+[|–—]\s+/)[0].trim(),
    requiresPageFetch: !imageUrl.startsWith("https://"),
  };
}

async function safelyEnrichFromProductPage(record: SitemapRecord) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await enrichFromProductPage(record);
    } catch {
      if (attempt === 0) await delay(500);
    }
  }
  return record;
}

function searchSource(url: URL, product: ImageMatchProduct) {
  const host = url.hostname.replace(/^www[.]/, "");
  const brand = distinctiveToken(product.name) || "";
  const hostText = normalizeImageMatchText(host.replace(/[.]/g, " ")).replace(/\s/g, "");
  const official = brand.length >= 3 && hostText.includes(brand);
  return {
    source: official ? `official_search_${host.split(".")[0]}` : `commercial_search_${host.split(".")[0]}`,
    tier: official ? "official" as const : "commercial" as const,
  };
}

function productNameWithoutAccessories(product: ImageMatchProduct) {
  return product.name
    .replace(/\b(?:estuche|est[.]?|bolsa|copa|vaso|regalo|combo|pack)\b[\s\S]*$/i, " ")
    .replace(/\bx\s*\d+(?:[.,]\d+)?\s*(?:c[.]?c[.]?|ml|cl|l|lt|unidades?|u)?\b/gi, " ")
    .replace(/\b(?:esp[.]?|v[.]?|b[.]?|t[.]?|rva[.]?)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function publicSearchQueries(product: ImageMatchProduct, preferredDomains: string[]) {
  const fullName = product.name.replace(/c[.]?c[.]?/gi, "ml").replace(/\s+/g, " ").trim();
  const coreName = productNameWithoutAccessories(product);
  const normalizedCore = normalizeImageMatchText(coreName);
  const presentation = product.presentation.replace(/c[.]?c[.]?/gi, "ml").trim();
  const family = normalizeImageMatchText(coreName).split(" ").filter((token) =>
    token.length > 1 && !INDEX_STOP_WORDS.has(token) && !/^\d+$/.test(token)).slice(0, 3).join(" ");
  const queries = [
    `"${coreName}" ${presentation}`,
    `${fullName} producto`,
    `${family} ${presentation}`,
    normalizedCore,
    ...preferredDomains.slice(0, 2).map((domain) => `site:${domain} ${coreName}`),
    `${coreName} ${product.sku}`,
  ];
  return [...new Set(queries.map((query) => query.replace(/\s+/g, " ").trim()).filter(Boolean))].slice(0, 6);
}

function duckDuckGoResults(html: string, product: ImageMatchProduct) {
  const records: PublicCatalogImage[] = [];
  for (const match of html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]+class=["']result-link["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    try {
      const redirectUrl = new URL(decodeHtml(match[1]), "https://duckduckgo.com");
      const target = redirectUrl.searchParams.get("uddg") || redirectUrl.href;
      const url = new URL(target);
      if (url.protocol !== "https:") continue;
      if (/\/listado(?:[/?]|$)|\/search(?:[/?]|$)|\/buscar(?:[/?]|$)/i.test(url.pathname)) continue;
      const name = decodeHtml(match[2]);
      const source = searchSource(url, product);
      records.push({
        key: url.href,
        source: source.source,
        tier: source.tier,
        sourceUrl: url.href,
        imageUrl: "",
        name,
        presentation: name,
      });
    } catch {
      // Ignore malformed third-party result URLs.
    }
  }
  return records.slice(0, 12);
}

function duckDuckGoImageResults(value: unknown, product: ImageMatchProduct) {
  if (!value || typeof value !== "object") return [];
  const payload = value as { results?: Array<{ image?: unknown; title?: unknown; url?: unknown }> };
  if (!Array.isArray(payload.results)) return [];
  return payload.results.flatMap((result, index) => {
    if (typeof result.image !== "string" || typeof result.title !== "string" || typeof result.url !== "string") return [];
    try {
      const sourceUrl = new URL(result.url);
      const imageUrl = new URL(result.image);
      if (sourceUrl.protocol !== "https:" || imageUrl.protocol !== "https:") return [];
      const source = searchSource(sourceUrl, product);
      return [{
        key: `${sourceUrl.href}#image-${index}`,
        source: source.source,
        tier: source.tier,
        sourceUrl: sourceUrl.href,
        imageUrl: imageUrl.href,
        name: decodeHtml(result.title),
        presentation: decodeHtml(result.title),
      } satisfies PublicCatalogImage];
    } catch {
      return [];
    }
  });
}

function decodeJavaScriptString(value: string) {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value.replace(/\\"/g, '"').replace(/\\\//g, "/");
  }
}

function braveImageResults(html: string, product: ImageMatchProduct) {
  const records: PublicCatalogImage[] = [];
  const pattern = /\{title:"([^"]+)",url:"([^"]+)"[\s\S]{0,2000}?original:"([^"]+)"/g;
  for (const match of html.matchAll(pattern)) {
    try {
      const name = decodeJavaScriptString(match[1]);
      const sourceUrl = new URL(decodeJavaScriptString(match[2]));
      const imageUrl = new URL(decodeJavaScriptString(match[3]));
      if (sourceUrl.protocol !== "https:" || imageUrl.protocol !== "https:") continue;
      const source = searchSource(sourceUrl, product);
      records.push({
        key: `${sourceUrl.href}#brave-${records.length}`,
        source: source.source,
        tier: source.tier,
        sourceUrl: sourceUrl.href,
        imageUrl: imageUrl.href,
        name,
        presentation: name,
      });
    } catch {
      // Ignore malformed external result records.
    }
  }
  return records;
}

function bingImageResults(html: string, product: ImageMatchProduct) {
  const records: PublicCatalogImage[] = [];
  for (const match of html.matchAll(/<a[^>]+class=["'][^"']*iusc[^"']*["'][^>]+m=["']([^"']+)["'][^>]*>/gi)) {
    try {
      const metadata = JSON.parse(decodeHtml(match[1])) as { murl?: unknown; purl?: unknown; t?: unknown };
      if (typeof metadata.murl !== "string" || typeof metadata.purl !== "string") continue;
      const sourceUrl = new URL(metadata.purl);
      const imageUrl = new URL(metadata.murl);
      if (sourceUrl.protocol !== "https:" || imageUrl.protocol !== "https:") continue;
      const source = searchSource(sourceUrl, product);
      const name = typeof metadata.t === "string" ? decodeHtml(metadata.t) : pageName(sourceUrl.href);
      records.push({
        key: `${sourceUrl.href}#bing-${records.length}`,
        source: source.source,
        tier: source.tier,
        sourceUrl: sourceUrl.href,
        imageUrl: imageUrl.href,
        name,
        presentation: name,
      });
    } catch {
      // Ignore malformed Bing metadata.
    }
  }
  return records;
}

function bestSearchResult(product: ImageMatchProduct, candidates: PublicCatalogImage[]) {
  const ranked = candidates
    .map((external, index) => ({ match: comparePublicCatalogImage(product, external), index }))
    .filter(({ match }) => match.hardConflicts.length === 0 && match.confidence >= 0.58)
    .sort((left, right) => {
      if (left.match.external?.tier !== right.match.external?.tier) return left.match.external?.tier === "official" ? -1 : 1;
      if (left.match.band !== right.match.band) {
        const rank = { high: 3, medium: 2, low: 1, none: 0 };
        return rank[right.match.band] - rank[left.match.band];
      }
      if (Math.abs(left.match.confidence - right.match.confidence) >= 0.02) return right.match.confidence - left.match.confidence;
      return left.index - right.index;
    });
  const best = ranked[0]?.match;
  if (!best || best.band === "high" || best.band === "medium") return best;
  const independentDomains = new Set(ranked.flatMap(({ match }) => {
    try {
      return match.external ? [new URL(match.external.sourceUrl).hostname.replace(/^www[.]/, "")] : [];
    } catch {
      return [];
    }
  }));
  if (independentDomains.size < 2) return undefined;
  return {
    ...best,
    confidence: 0.72,
    band: "medium" as const,
    needsReview: true,
    matchedFields: [...best.matchedFields, "corroborado por segunda fuente"],
  };
}

async function imageSearchFallback(
  product: ImageMatchProduct,
  preferredDomains: string[],
  rejectedUrls: Set<string>,
) {
  if (duckSearchEnabled) {
    const duckCandidates: PublicCatalogImage[] = [];
    for (const rawQuery of publicSearchQueries(product, preferredDomains).slice(0, 3)) {
      const query = encodeURIComponent(rawQuery);
      try {
        const searchPage = await fetchWithRetry(`https://duckduckgo.com/?q=${query}&iax=images&ia=images`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
            Accept: "text/html",
          },
        }, 2);
        if (!searchPage.ok) continue;
        const html = await searchPage.text();
        const vqd = html.match(/vqd=["']([^"'&]+)/)?.[1]
          || html.match(/vqd=([^&"'\s]+)/)?.[1];
        if (!vqd) continue;
        const response = await fetchWithRetry(`https://duckduckgo.com/i.js?l=ar-es&o=json&q=${query}&vqd=${encodeURIComponent(vqd)}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
            Referer: "https://duckduckgo.com/",
            Accept: "application/json",
          },
        }, 2);
        if (!response.ok) continue;
        duckCandidates.push(...duckDuckGoImageResults(await response.json(), product));
        const usable = duckCandidates.filter((candidate) =>
          !rejectedUrls.has(candidate.imageUrl) && !rejectedUrls.has(candidate.sourceUrl));
        const best = bestSearchResult(product, usable);
        if (best?.band === "high" || best?.band === "medium") return best;
      } catch {
        // Continue with the next query variant or the static source catalogs.
      }
    }
    const best = bestSearchResult(product, duckCandidates.filter((candidate) =>
      !rejectedUrls.has(candidate.imageUrl) && !rejectedUrls.has(candidate.sourceUrl)));
    if (best) return best;
  }
  const candidates: PublicCatalogImage[] = [];
  for (const rawQuery of publicSearchQueries(product, preferredDomains)) {
    const query = encodeURIComponent(rawQuery);
    const [brave, bing] = await Promise.all([
      execFile("/usr/bin/curl", [
        "-sL", "--compressed", "--max-time", "20",
        "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        `https://search.brave.com/images?q=${query}&source=web`,
      ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 25_000 }).then(({ stdout }) => braveImageResults(stdout, product)).catch(() => []),
      execFile("/usr/bin/curl", [
        "-sL", "--compressed", "--max-time", "20",
        "-A", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        `https://www.bing.com/images/search?q=${query}&form=HDRSC3&first=1`,
      ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 25_000 }).then(({ stdout }) => bingImageResults(stdout, product)).catch(() => []),
    ]);
    candidates.push(...brave, ...bing);
    const usable = [...new Map(candidates
      .filter((candidate) => !rejectedUrls.has(candidate.imageUrl) && !rejectedUrls.has(candidate.sourceUrl))
      .map((candidate) => [candidate.imageUrl, candidate])).values()];
    const best = bestSearchResult(product, usable);
    if (best?.band === "high" || (best?.band === "medium" && usable.length >= 6)) return best;
    await delay(150);
  }
  const best = bestSearchResult(product, candidates.filter((candidate) =>
    !rejectedUrls.has(candidate.imageUrl) && !rejectedUrls.has(candidate.sourceUrl)));
  if (best) return best;
  if (!duckSearchEnabled) return undefined;
  const query = encodeURIComponent(publicSearchQueries(product, preferredDomains)[0]);
  try {
    const searchPage = await fetchWithRetry(`https://duckduckgo.com/?q=${query}&iax=images&ia=images`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Accept: "text/html",
      },
    }, 2);
    if (!searchPage.ok) return undefined;
    const html = await searchPage.text();
    const vqd = html.match(/vqd=["']([^"']+)/)?.[1] || html.match(/vqd=([^&"'\s]+)/)?.[1];
    if (!vqd) return undefined;
    const response = await fetchWithRetry(`https://duckduckgo.com/i.js?l=ar-es&o=json&q=${query}&vqd=${encodeURIComponent(vqd)}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Referer: "https://duckduckgo.com/",
        Accept: "application/json",
      },
    }, 2);
    if (!response.ok) return undefined;
    return bestSearchResult(product, duckDuckGoImageResults(await response.json(), product));
  } catch {
    return undefined;
  }
}

async function searchFallback(
  product: ImageMatchProduct,
  preferredDomains: string[],
  rejectedUrls: Set<string>,
): Promise<ImageMatchResult> {
  const imageMatch = await imageSearchFallback(product, preferredDomains, rejectedUrls);
  if (imageMatch) return imageMatch;
  if (!duckSearchEnabled) {
    return { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false };
  }
  const query = encodeURIComponent(publicSearchQueries(product, preferredDomains)[0]);
  let response: Response;
  try {
    response = await fetchWithRetry(`https://lite.duckduckgo.com/lite/?q=${query}&kl=ar-es`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        Accept: "text/html",
      },
    }, 2);
  } catch {
    return { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false };
  }
  if (!response.ok) return { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false };
  const resultCandidates = duckDuckGoResults(await response.text(), product)
    .map((external) => comparePublicCatalogImage(product, external))
    .filter((match) => match.hardConflicts.length === 0 && (match.band === "high" || match.band === "medium"))
    .sort((left, right) => {
      if (left.external?.tier !== right.external?.tier) return left.external?.tier === "official" ? -1 : 1;
      return right.confidence - left.confidence;
    })
    .slice(0, 3);
  for (const candidate of resultCandidates) {
    const external = candidate.external;
    if (!external) continue;
    const enriched = await safelyEnrichFromProductPage({ ...external, requiresPageFetch: true });
    if (!enriched.imageUrl.startsWith("https://")) continue;
    const resolved = comparePublicCatalogImage(product, enriched);
    if (!resolved.hardConflicts.length && (resolved.band === "high" || resolved.band === "medium")) return resolved;
  }
  return { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false };
}

async function readSearchCache(products: ImageMatchProduct[]) {
  const productById = new Map(products.map((product) => [product.id, product]));
  try {
    const records = JSON.parse(await readFile(searchCachePath, "utf8")) as SearchCacheRecord[];
    return new Map(records.flatMap((record) => {
      const product = productById.get(record.productId);
      const reusable = !duckSearchEnabled || record.band === "high" || record.band === "medium";
      return product && reusable ? [[record.productId, { ...record, product } satisfies ImageMatchResult] as const] : [];
    }));
  } catch {
    return new Map<string, ImageMatchResult>();
  }
}

function cacheRecord(match: ImageMatchResult): SearchCacheRecord {
  return {
    productId: match.product.id,
    external: match.external,
    confidence: match.confidence,
    band: match.band,
    exact: match.exact,
    matchedFields: match.matchedFields,
    hardConflicts: match.hardConflicts,
    needsReview: match.needsReview,
  };
}

async function mapLimit<T, U>(items: T[], limit: number, mapper: (item: T, index: number) => Promise<U>) {
  const results = new Array<U>(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

function chooseBySourcePriority(product: ImageMatchProduct, catalogs: Array<{
  source: SourceDefinition;
  products: SitemapRecord[];
  index: Map<string, SitemapRecord[]>;
}>, preferredSources: Set<string>, rejectedUrls: Set<string>) {
  let medium: ImageMatchResult | undefined;
  let low: ImageMatchResult | undefined;
  const corroboratedLow: ImageMatchResult[] = [];
  const tokens = normalizeImageMatchText(productNameWithoutAccessories(product)).split(" ")
    .filter((token) => token.length > 1 && !INDEX_STOP_WORDS.has(token) && !/^\d+$/.test(token));
  const tierRank: Record<ImageSourceTier, number> = { positano: 0, official: 1, distributor: 2, commercial: 3 };
  const orderedCatalogs = [...catalogs].sort((left, right) =>
    tierRank[left.source.tier] - tierRank[right.source.tier]
    || Number(preferredSources.has(right.source.key)) - Number(preferredSources.has(left.source.key)));
  for (const catalog of orderedCatalogs) {
    const candidates = [...new Map(tokens.flatMap((token) => catalog.index.get(token) ?? [])
      .map((candidate) => [candidate.sourceUrl, candidate])).values()];
    const match = bestPublicCatalogMatch(product, candidates.filter((candidate) =>
      !rejectedUrls.has(candidate.sourceUrl) && !rejectedUrls.has(candidate.imageUrl)));
    if (match.hardConflicts.length) continue;
    if (match.band === "high") return match;
    if (match.band === "medium" && !medium) medium = match;
    if (match.band === "low") {
      if (!low) low = match;
      if (match.confidence >= 0.58) corroboratedLow.push(match);
    }
  }
  if (!medium && new Set(corroboratedLow.map((match) => match.external?.source).filter(Boolean)).size >= 2) {
    const best = [...corroboratedLow].sort((left, right) => right.confidence - left.confidence)[0];
    return {
      ...best,
      confidence: 0.72,
      band: "medium" as const,
      needsReview: true,
      matchedFields: [...best.matchedFields, "corroborado por segunda fuente"],
    };
  }
  return medium || low || { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false } satisfies ImageMatchResult;
}

async function publish(candidateIds: string[]) {
  let pending = [...candidateIds];
  let published = 0;
  const failures: string[] = [];
  for (let pass = 0; pass < 2 && pending.length; pass += 1) {
    const retry: string[] = [];
    for (let index = 0; index < pending.length; index += 10) {
      const batch = pending.slice(index, index + 10);
      const response = await jobRequest("", { method: "POST", body: JSON.stringify({ candidateIds: batch }) });
      if (!response.ok) retry.push(...batch);
      else {
        const result = await response.json() as { published: number; failures: Array<{ candidateId: string }> };
        published += result.published;
        retry.push(...result.failures.map((failure) => failure.candidateId));
      }
      if ((index + batch.length) % 50 === 0 || index + batch.length === pending.length) {
        console.log(JSON.stringify({ stage: "publish", pass: pass + 1, processed: index + batch.length, total: pending.length, published }));
      }
      await delay(180);
    }
    pending = retry;
  }
  failures.push(...pending);
  return { published, failures };
}

async function importResilient(items: Array<Record<string, unknown>>) {
  const candidateIds: string[] = [];
  const failures: Array<{ productId: string; reason: string }> = [];
  async function importBatch(batch: Array<Record<string, unknown>>): Promise<void> {
    let response: Response;
    try {
      response = await jobRequest("", { method: "PUT", body: JSON.stringify({ items: batch }) });
    } catch (error) {
      if (batch.length === 1) {
        failures.push({
          productId: String(batch[0].productId || ""),
          reason: error instanceof Error ? error.message : "network_error",
        });
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      await importBatch(batch.slice(0, middle));
      await importBatch(batch.slice(middle));
      return;
    }
    if (!response.ok) {
      if (batch.length === 1) {
        failures.push({ productId: String(batch[0].productId || ""), reason: `HTTP ${response.status}` });
        return;
      }
      const middle = Math.ceil(batch.length / 2);
      await importBatch(batch.slice(0, middle));
      await importBatch(batch.slice(middle));
      return;
    }
    const result = await response.json() as { imported: Array<{ candidate_id: string; auto_publish: boolean }> };
    candidateIds.push(...result.imported.filter((item) => item.auto_publish).map((item) => item.candidate_id));
  }
  for (let index = 0; index < items.length; index += 25) {
    await importBatch(items.slice(index, index + 25));
    if ((index + 25) % 250 === 0 || index + 25 >= items.length) {
      console.log(JSON.stringify({ stage: "import", processed: Math.min(index + 25, items.length), total: items.length, failures: failures.length }));
    }
  }
  return { candidateIds, failures };
}

const products = await loadProducts();
console.log(JSON.stringify({ stage: "products", count: products.length }));
if (products.length !== expectedPhase2Products) {
  throw new Error(`Preflight Phase 2 bloqueado: se esperaban ${expectedPhase2Products} productos y se recibieron ${products.length}.`);
}
const [publishedBefore, rejectedBefore] = await Promise.all([
  loadPriorCandidates("published"),
  loadPriorCandidates("rejected"),
]);
const rejectedUrls = new Set(rejectedBefore.flatMap((candidate) => [candidate.sourceUrl, candidate.imageUrl]).filter(Boolean));
const familyDomains = new Map<string, string[]>();
const familySources = new Map<string, Set<string>>();
for (const candidate of publishedBefore) {
  const family = distinctiveToken(candidate.productName);
  if (!family) continue;
  try {
    const domain = new URL(candidate.sourceUrl).hostname.replace(/^www[.]/, "");
    familyDomains.set(family, [...new Set([...(familyDomains.get(family) ?? []), domain])]);
  } catch {
    // Keep family discovery resilient to historic malformed URLs.
  }
  const sources = familySources.get(family) ?? new Set<string>();
  sources.add(candidate.source);
  familySources.set(family, sources);
}
console.log(JSON.stringify({ stage: "family-discovery", publishedReferences: publishedBefore.length, rejectedReferences: rejectedBefore.length, families: familyDomains.size }));
const relevantTokens = new Set(products.map((product) => distinctiveToken(product.name)).filter((token): token is string => Boolean(token)));
const sourceCatalogs = await mapLimit(SOURCES, 4, async (source) => {
  const catalog = await loadSourceCatalog(source, relevantTokens);
  console.log(JSON.stringify({ stage: "source", source: source.key, products: catalog.length }));
  return { source, products: catalog, index: catalogIndex(catalog) };
});
const initial = products.map((product) => {
  const family = distinctiveToken(product.name) || "";
  return chooseBySourcePriority(product, sourceCatalogs, familySources.get(family) ?? new Set(), rejectedUrls);
});
const selectedRecords = new Map<string, SitemapRecord>();
for (const match of initial) {
  const record = match.external as SitemapRecord | undefined;
  if (record?.requiresPageFetch) selectedRecords.set(record.sourceUrl, record);
}
console.log(JSON.stringify({ stage: "enrich", pages: selectedRecords.size }));
const enriched = await mapLimit([...selectedRecords.values()], 6, async (record, index) => {
  const result = await safelyEnrichFromProductPage(record);
  if ((index + 1) % 100 === 0 || index + 1 === selectedRecords.size) {
    console.log(JSON.stringify({ stage: "enrich", processed: index + 1, total: selectedRecords.size }));
  }
  return result;
});
const enrichedByUrl = new Map(enriched.map((record) => [record.sourceUrl, record]));
const catalogMatches = initial.map((match) => {
  const external = match.external as SitemapRecord | undefined;
  if (!external) return match;
  const resolved = enrichedByUrl.get(external.sourceUrl) || external;
  if (!resolved.imageUrl.startsWith("https://")) return { ...match, confidence: 0, band: "none" as const, external: undefined };
  return comparePublicCatalogImage(match.product, resolved);
});
const searchCache = await readSearchCache(products);
const unresolved = catalogMatches.filter((match) => match.band === "none" || match.band === "low");
const pendingSearch = unresolved.filter((match) => !searchCache.has(match.product.id));
const searchQueue = searchDisabled ? [] : searchFallbackLimit > 0 ? pendingSearch.slice(0, searchFallbackLimit) : pendingSearch;
console.log(JSON.stringify({ stage: "search", unresolved: unresolved.length, cached: unresolved.length - pendingSearch.length, queued: searchQueue.length }));
let searchedCount = 0;
for (let index = 0; index < searchQueue.length; index += 100) {
  const batch = searchQueue.slice(index, index + 100);
  const searched = await mapLimit(batch, 4, async (match) => {
    const family = distinctiveToken(match.product.name) || "";
    const result = await searchFallback(match.product, familyDomains.get(family) ?? [], rejectedUrls);
    await delay(200);
    return result;
  });
  for (const match of searched) searchCache.set(match.product.id, match);
  searchedCount += searched.length;
  await writeFile(searchCachePath, `${JSON.stringify([...searchCache.values()].map(cacheRecord), null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ stage: "search", processed: searchedCount, total: searchQueue.length, cached: searchCache.size }));
  if (index + batch.length < searchQueue.length) await delay(2_500);
}
const finalMatches = catalogMatches.map((match) => {
  if (match.band !== "none" && match.band !== "low") return match;
  const searchedMatch = searchCache.get(match.product.id);
  return searchedMatch && (searchedMatch.band === "high" || searchedMatch.band === "medium") ? searchedMatch : match;
});
const publishable = finalMatches.filter((match) =>
  (match.band === "high" || match.band === "medium")
  && match.external?.imageUrl.startsWith("https://")
  && match.hardConflicts.length === 0);
const high = publishable.filter((match) => match.band === "high");
const medium = publishable.filter((match) => match.band === "medium");
const low = finalMatches.filter((match) => match.band === "low");
const noMatch = finalMatches.filter((match) => match.band === "none");
let automaticPublication = { published: 0, failures: [] as string[] };
let importFailures: Array<{ productId: string; reason: string }> = [];

if (mode === "execute") {
  const items = publishable.map((match) => {
    const reviewRisk = reviewRiskForMatch(match);
    return ({
    productId: match.product.id,
    source: match.external?.source,
    sourceTier: match.external?.tier,
    sourceProductKey: match.external?.key,
    sourceUrl: match.external?.sourceUrl,
    imageUrl: match.external?.imageUrl,
    externalProductName: match.external?.name,
    externalPresentation: match.external?.presentation || match.external?.name,
    confidence: match.confidence,
    exact: match.exact,
    autoPublish: true,
    needsReview: match.needsReview,
    matchedFields: match.matchedFields,
    mismatchWarnings: [],
    hardConflicts: match.hardConflicts,
    visualVariant: visualVariantForSku(match.product.sku),
    reviewRiskRank: reviewRisk.rank,
    reviewRiskKind: reviewRisk.kind,
    reviewRiskReason: reviewRisk.reason,
    reviewPriorityScore: reviewRisk.score,
    reviewRiskVersion: 2,
    runId,
    });
  });
  const imported = await importResilient(items);
  importFailures = imported.failures;
  automaticPublication = await publish(imported.candidateIds);
  await jobRequest("", { method: "PATCH", body: JSON.stringify({ complete: true }) });
}

const sourceCounts = Object.fromEntries([...new Set([
  ...SOURCES.map((source) => source.key),
  ...publishable.map((match) => match.external?.source).filter((source): source is string => Boolean(source)),
])].map((source) => [source, publishable.filter((match) => match.external?.source === source).length]));
const report = {
  runId,
  mode,
  finishedAt: new Date().toISOString(),
  productsSearched: products.length,
  sourceCatalogProducts: Object.fromEntries(sourceCatalogs.map(({ source, products: sourceProducts }) => [source.key, sourceProducts.length])),
  sourceMatches: sourceCounts,
  high: high.length,
  medium: medium.length,
  needsReview: medium.length,
  low: low.length,
  noImageFound: noMatch.length + low.length,
  autoPublished: automaticPublication.published,
  publicationFailures: automaticPublication.failures,
  importFailures,
  projectedCoverageAdded: publishable.length,
  matches: finalMatches.map((match) => ({
    productId: match.product.id,
    sku: match.product.sku,
    productName: match.product.name,
    source: match.external?.source,
    sourceUrl: match.external?.sourceUrl,
    imageUrl: match.external?.imageUrl,
    externalProductName: match.external?.name,
    confidence: match.confidence,
    band: match.band,
    exact: match.exact,
    hardConflicts: match.hardConflicts,
  })),
};
await writeFile(`docs/mass-image-coverage-phase2-${mode}-2026-08-29.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, matches: undefined }));
