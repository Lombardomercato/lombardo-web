import { writeFile } from "node:fs/promises";

interface RuniaProduct {
  id: string;
  sku: string;
  name: string;
  presentation: string;
}

interface PositanoProduct {
  key: string;
  name: string;
  brand: string;
  sourceUrl: string;
  imageUrl: string;
}

interface MatchResult {
  product: RuniaProduct;
  external?: PositanoProduct;
  confidence: number;
  band: "high" | "medium" | "low" | "none";
  exact: boolean;
  matchedFields: string[];
  mismatchWarnings: string[];
}

const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const token = process.env.IMAGE_JOB_TOKEN || "";
const confirmation = process.env.POSITANO_MASS_RUN_CONFIRM;
const runId = `positano-mass-${new Date().toISOString().slice(0, 10)}`;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (confirmation !== "RUN_ONCE_2026_08_29" || !baseUrl.startsWith("https://") || !uuidPattern.test(jobId) || token.length < 43) {
  throw new Error("Configuración incompleta para la corrida única de imágenes.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchWithRetry(url: string, init: RequestInit = {}, attempts = 3) {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    if (attempt + 1 < attempts) await delay(750 * (attempt + 1));
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

async function loadPaged<T>(path: string, key: "candidates" | "products") {
  const items: T[] = [];
  let offset = 0;
  while (true) {
    const separator = path.includes("?") ? "&" : "?";
    const response = await jobRequest(`${path}${separator}offset=${offset}&limit=100`);
    if (!response.ok) throw new Error(`No se pudo leer ${key}: HTTP ${response.status}`);
    const page = await response.json() as { candidates?: T[]; products?: T[]; hasMore: boolean; limit: number };
    const values = page[key] || [];
    items.push(...values);
    if (!page.hasMore || !values.length) break;
    offset += page.limit;
  }
  return items;
}

async function publish(candidateIds: string[]) {
  let published = 0;
  const failures: string[] = [];
  for (let index = 0; index < candidateIds.length; index += 10) {
    const batch = candidateIds.slice(index, index + 10);
    const response = await jobRequest("", { method: "POST", body: JSON.stringify({ candidateIds: batch }) });
    if (!response.ok) {
      failures.push(...batch);
    } else {
      const result = await response.json() as { published: number; failures: Array<{ candidateId: string }> };
      published += result.published;
      failures.push(...result.failures.map((failure) => failure.candidateId));
    }
    await delay(250);
  }
  return { published, failures };
}

function clean(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR")
    .replace(/\bc[.]?c[.]?\b/g, "cc").replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function volumeMl(value: string) {
  const normalized = clean(value);
  const match = normalized.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(ml|cc|cl|l|lt|litros?)(?:\s|$)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "l" || match[2] === "lt" || match[2].startsWith("litro")) return Math.round(amount * 1000);
  if (match[2] === "cl") return Math.round(amount * 10);
  return Math.round(amount);
}

const varietals = [
  "cabernet sauvignon", "cabernet franc", "sauvignon blanc", "pinot noir", "petit verdot",
  "brut nature", "extra brut", "malbec", "chardonnay", "merlot", "syrah", "bonarda",
  "tempranillo", "tannat", "torrontes", "ancellotta", "riesling", "viognier", "rose", "brut",
];
const lines = ["gran reserva", "grand reserve", "reserva", "reserve", "single vineyard", "coleccion", "collection"];

function markers(value: string, vocabulary: string[]) {
  const normalized = ` ${clean(value)} `;
  return vocabulary.filter((token) => normalized.includes(` ${token} `));
}

function packaging(value: string) {
  const normalized = clean(value);
  const flags: string[] = [];
  if (/\b(pack|caja|combo)\b/.test(normalized) || /\bx\s*(?:2|3|4|6|12|24)\b/.test(normalized)) flags.push("pack");
  if (/\b(estuche|gift|regalo)\b/.test(normalized)) flags.push("estuche");
  if (/\b(lata|can)\b/.test(normalized)) flags.push("lata");
  return flags;
}

function comparableTokens(value: string) {
  const normalized = clean(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cc|cl|l|lt|litros?|gr|g|kg)\b/g, " ")
    .replace(/\b(?:vino|vinos|bebida|botella|unidad|x)\b/g, " ");
  return new Set(normalized.split(" ").filter((token) => token.length > 1));
}

function jaccard(left: Set<string>, right: Set<string>) {
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  const union = new Set([...left, ...right]).size;
  return union ? common / union : 0;
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function compare(product: RuniaProduct, external: PositanoProduct): MatchResult {
  const productText = `${product.name} ${product.presentation}`;
  const externalText = `${external.name} ${external.brand}`;
  const productVolume = volumeMl(productText);
  const externalVolume = volumeMl(externalText);
  const productVarietals = markers(productText, varietals);
  const externalVarietals = markers(externalText, varietals);
  const productLines = markers(productText, lines);
  const externalLines = markers(externalText, lines);
  const productPackaging = packaging(productText);
  const externalPackaging = packaging(externalText);
  const mismatchWarnings: string[] = [];
  if (productVolume && externalVolume && productVolume !== externalVolume) mismatchWarnings.push("volumen diferente");
  if (productVarietals.length && externalVarietals.length && !sameSet(productVarietals, externalVarietals)) mismatchWarnings.push("varietal diferente");
  if (!sameSet(productLines, externalLines)) mismatchWarnings.push("línea diferente");
  if (!sameSet(productPackaging, externalPackaging)) mismatchWarnings.push("packaging diferente");

  const tokensProduct = comparableTokens(productText);
  const tokensExternal = comparableTokens(externalText);
  const similarity = jaccard(tokensProduct, tokensExternal);
  const volumeMatch = Boolean(productVolume && externalVolume && productVolume === externalVolume);
  const coreProduct = [...tokensProduct].sort().join(" ");
  const coreExternal = [...tokensExternal].sort().join(" ");
  const exactCore = coreProduct === coreExternal;
  const exact = mismatchWarnings.length === 0 && volumeMatch && (exactCore || similarity >= 0.9);
  let confidence = exact ? Math.max(0.94, similarity) : mismatchWarnings.length ? Math.min(0.69, similarity) : similarity * 0.9;
  if (!productVolume || !externalVolume) confidence = Math.min(confidence, 0.88);
  const band = confidence >= 0.9 ? "high" : confidence >= 0.72 ? "medium" : confidence >= 0.48 ? "low" : "none";
  const matchedFields = [
    `nombre ${Math.round(similarity * 100)}%`,
    ...(volumeMatch ? [`presentación ${productVolume} ml`] : []),
    ...(productVarietals.length && sameSet(productVarietals, externalVarietals) ? [`varietal ${productVarietals.join("/")}`] : []),
  ];
  return { product, external, confidence: Math.round(confidence * 10_000) / 10_000, band, exact, matchedFields, mismatchWarnings };
}

function bestMatch(product: RuniaProduct, source: PositanoProduct[]) {
  const ranked = source.map((external) => compare(product, external)).sort((a, b) => b.confidence - a.confidence);
  const best = ranked[0];
  if (!best || best.band === "none") return { product, confidence: 0, band: "none", exact: false, matchedFields: [], mismatchWarnings: [] } satisfies MatchResult;
  if (best.band === "high" && ranked[1] && best.confidence - ranked[1].confidence < 0.08) {
    return { ...best, confidence: 0.89, band: "medium" as const, exact: false, mismatchWarnings: [...best.mismatchWarnings, "match ambiguo"] };
  }
  return best;
}

function preferredImage(url: string) {
  return url.replace(/-480-0([.][a-z0-9]+)$/i, "-1024-1024$1");
}

async function loadPositano() {
  const products = new Map<string, PositanoProduct>();
  const scriptPattern = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (let page = 1; page <= 20; page += 1) {
    const pageUrl = page === 1 ? "https://www.positanovinos.com.ar/productos/" : `https://www.positanovinos.com.ar/productos/page/${page}/`;
    const response = await fetchWithRetry(pageUrl, { headers: { "User-Agent": "LombardoImageMatching/1.0", Accept: "text/html" } });
    if (!response.ok) throw new Error(`Positano respondió HTTP ${response.status} en página ${page}.`);
    const html = await response.text();
    let found = 0;
    for (const match of html.matchAll(scriptPattern)) {
      try {
        const data = JSON.parse(match[1]) as Record<string, unknown>;
        if (data["@type"] !== "Product" || typeof data.name !== "string" || typeof data.image !== "string") continue;
        const pageData = data.mainEntityOfPage as { "@id"?: unknown } | undefined;
        const brandData = data.brand as { name?: unknown } | undefined;
        const sourceUrl = typeof pageData?.["@id"] === "string" ? pageData["@id"] : "";
        if (!sourceUrl.startsWith("https://www.positanovinos.com.ar/")) continue;
        const product: PositanoProduct = {
          key: typeof data.sku === "string" ? data.sku : sourceUrl,
          name: data.name,
          brand: typeof brandData?.name === "string" ? brandData.name : "",
          sourceUrl,
          imageUrl: preferredImage(data.image),
        };
        products.set(sourceUrl, product);
        found += 1;
      } catch {
        // Other schema.org blocks on the page are not products.
      }
    }
    if (!found) break;
    await delay(550);
  }
  return [...products.values()];
}

const approvedQueue = await loadPaged<{ id: string }>("?queue=approved", "candidates");
const previousPublication = await publish(approvedQueue.map((candidate) => candidate.id));
const unmatchedProducts = await loadPaged<RuniaProduct>("", "products");
const positanoProducts = await loadPositano();
const matches = unmatchedProducts.map((product) => bestMatch(product, positanoProducts));
const high = matches.filter((match) => match.band === "high" && match.exact && !match.mismatchWarnings.length);
const medium = matches.filter((match) => match.band === "medium");
const low = matches.filter((match) => match.band === "low");
const noMatch = matches.filter((match) => match.band === "none");
const importable = [...high, ...medium].map((match) => ({
  productId: match.product.id,
  sourceProductKey: match.external?.key,
  sourceUrl: match.external?.sourceUrl,
  imageUrl: match.external?.imageUrl,
  externalProductName: match.external?.name,
  externalPresentation: match.external ? `${match.external.name}` : "",
  confidence: match.confidence,
  exact: match.exact,
  autoPublish: match.band === "high" && match.exact && !match.mismatchWarnings.length,
  matchedFields: match.matchedFields,
  mismatchWarnings: match.mismatchWarnings,
  runId,
}));

const autoCandidateIds: string[] = [];
for (let index = 0; index < importable.length; index += 25) {
  const response = await jobRequest("", { method: "PUT", body: JSON.stringify({ items: importable.slice(index, index + 25) }) });
  if (!response.ok) throw new Error(`Falló la persistencia del lote de matching: HTTP ${response.status}.`);
  const result = await response.json() as { imported: Array<{ candidate_id: string; auto_publish: boolean }> };
  autoCandidateIds.push(...result.imported.filter((item) => item.auto_publish).map((item) => item.candidate_id));
  await delay(150);
}

const automaticPublication = await publish(autoCandidateIds);
await jobRequest("", { method: "PATCH", body: "{}" });

const report = {
  runId,
  finishedAt: new Date().toISOString(),
  previousApproved: approvedQueue.length,
  previousPublished: previousPublication.published,
  previousFailures: previousPublication.failures,
  productsSearched: unmatchedProducts.length,
  positanoCatalogProducts: positanoProducts.length,
  exactHighMatches: high.length,
  autoPublished: automaticPublication.published,
  autoPublicationFailures: automaticPublication.failures,
  mediumReview: medium.length,
  low: low.length,
  noMatch: noMatch.length,
  matches: matches.map((match) => ({
    productId: match.product.id,
    sku: match.product.sku,
    productName: match.product.name,
    sourceUrl: match.external?.sourceUrl,
    externalProductName: match.external?.name,
    confidence: match.confidence,
    band: match.band,
    exact: match.exact,
    mismatchWarnings: match.mismatchWarnings,
  })),
};
await writeFile("docs/positano-mass-image-run-2026-08-29.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ ...report, matches: undefined }));
