export type MatchConfidenceBand = "high" | "medium" | "low" | "none";
export type ImageSourceTier = "positano" | "official" | "distributor" | "commercial";
export type LombardoVisualVariant = "wine" | "spirits" | "beer" | "gourmet" | "gifts";

export interface ImageMatchProduct {
  id: string;
  sku: string;
  name: string;
  presentation: string;
}

export interface PublicCatalogImage {
  key: string;
  source: string;
  tier: ImageSourceTier;
  sourceUrl: string;
  imageUrl: string;
  name: string;
  presentation?: string;
}

export interface ImageMatchResult {
  product: ImageMatchProduct;
  external?: PublicCatalogImage;
  confidence: number;
  band: MatchConfidenceBand;
  exact: boolean;
  matchedFields: string[];
  hardConflicts: string[];
  needsReview: boolean;
}

export interface ImageReviewRisk {
  rank: 1 | 2 | 3 | 4 | 5 | 6;
  kind: "product" | "brand_line" | "varietal" | "presentation_volume" | "pack_unit" | "confidence";
  reason: string;
  score: number;
}

const STOP_WORDS = new Set([
  "vino", "vinos", "bebida", "bebidas", "botella", "botellas", "unidad", "unidades",
  "unid", "u", "x", "de", "del", "la", "las", "el", "los", "con", "sin", "para",
  "argentina", "argentino", "argentina", "bodega", "shop", "tienda", "comprar", "online",
]);

const VARIETALS = [
  "cabernet sauvignon", "cabernet franc", "sauvignon blanc", "pinot noir", "petit verdot",
  "brut nature", "extra brut", "malbec", "chardonnay", "merlot", "syrah", "shiraz",
  "bonarda", "tempranillo", "tannat", "torrontes", "ancellotta", "riesling", "viognier",
  "semillon", "chenin", "moscatel", "rose", "rosado", "brut", "blend", "corte",
] as const;

const LINE_MARKERS = [
  "gran reserva", "grand reserve", "single vineyard", "estate", "reserva", "reserve",
  "coleccion", "collection", "alta", "altitud", "raices", "pasionado", "primus",
  "icono", "icon", "roble", "premium", "clasico", "classic", "family reserve",
  "maria carmen", "maría carmen", "founders reserve", "limited edition", "edicion limitada",
  "millesime", "blanc de blancs", "golden black", "golden reserve", "familia", "estirpe",
  "choco a la frutilla", "dunkel", "hefeweizen", "sin azucar", "con azucar",
] as const;

const STRONG_PRODUCT_KINDS = [
  "gin", "ginebra", "vodka", "whisky", "cognac", "licor", "cerveza", "ketchup",
  "mostaza", "aderezo", "vinagre", "chocolate", "garrapinada",
] as const;

const SPIRITS_PREFIXES = [
  "APE", "BB", "BDS", "COS", "CRA", "KNH", "LIC", "NWS", "PHA", "PIND", "VV", "WI",
];
const GOURMET_PREFIXES = [
  "BAD", "BIM", "BOR", "CAF", "CHO", "COM", "DEC", "FOL", "JCR", "LAU", "LOM", "MAI",
  "MOR", "QES", "SEG", "VALE",
];

function replaceAliases(value: string) {
  return value
    .replace(/\bcab[.]?\s*sauv(?:ignon)?\b/g, "cabernet sauvignon")
    .replace(/\bcab[.]?\s*franc\b/g, "cabernet franc")
    .replace(/\bsauv[.]?\s*blanc\b/g, "sauvignon blanc")
    .replace(/\bpinot\s*noire?\b/g, "pinot noir")
    .replace(/\bpetit\s*verdot\b/g, "petit verdot")
    .replace(/\bchardon+ay\b/g, "chardonnay")
    .replace(/\btorront[eé]s\b/g, "torrontes")
    .replace(/\bwhiskey\b/g, "whisky")
    .replace(/\b(?:rva|rsv|reserv)\b/g, "reserva")
    .replace(/\b(?:est|estuche)\s*x?\s*1\b/g, "estuche")
    .replace(/\bc[.]?c[.]?\b/g, "ml")
    .replace(/\blts?\b/g, "l");
}

export function reviewRiskForMatch(match: ImageMatchResult): ImageReviewRisk {
  const productText = `${match.product.name} ${match.product.presentation}`;
  const externalText = `${match.external?.name ?? ""} ${match.external?.presentation ?? ""}`;
  const externalUrl = match.external?.sourceUrl ?? "";
  const productVolume = volumeMl(productText);
  const externalVolume = volumeMl(externalText);
  const productNameVolume = volumeMl(match.product.name);
  const productPresentationVolume = volumeMl(match.product.presentation);
  const productPackaging = packaging(productText);
  const externalPackaging = packaging(externalText);
  const productVarietals = markers(productText, VARIETALS);
  const externalVarietals = markers(externalText, VARIETALS);
  const productLines = markers(productText, LINE_MARKERS);
  const externalLines = markers(externalText, LINE_MARKERS);
  const productKinds = markers(productText, STRONG_PRODUCT_KINDS);
  const externalKinds = markers(externalText, STRONG_PRODUCT_KINDS);
  const score = (rank: number) => ((7 - rank) * 1000) + Math.round((1 - match.confidence) * 100);

  if (match.hardConflicts.some((conflict) => /producto diferente|marca diferente/i.test(conflict))
    || (externalKinds.length > 0 && !sameSet(productKinds, externalKinds))
    || /coloriage|abillion|pinterest|wikipedia/i.test(externalUrl)
    || /^https:\/\/[^/]+\/?(?:[?#].*)?$/i.test(externalUrl)) {
    return { rank: 1, kind: "product", reason: "Posible producto diferente o fuente genérica", score: score(1) };
  }
  if (match.hardConflicts.some((conflict) => /marca|línea/i.test(conflict))
    || ((productLines.length || externalLines.length) && !sameSet(productLines, externalLines))) {
    return { rank: 2, kind: "brand_line", reason: "Posible conflicto de marca o línea", score: score(2) };
  }
  if ((productVarietals.length || externalVarietals.length) && !sameSet(productVarietals, externalVarietals)) {
    return { rank: 3, kind: "varietal", reason: "Posible conflicto de varietal", score: score(3) };
  }
  if (match.hardConflicts.some((conflict) => /volumen|presentación/i.test(conflict))
    || (productNameVolume && productPresentationVolume && productNameVolume !== productPresentationVolume)
    || (productVolume && (!externalVolume || productVolume !== externalVolume))) {
    return { rank: 4, kind: "presentation_volume", reason: "Revisar presentación o volumen", score: score(4) };
  }
  if (match.hardConflicts.some((conflict) => /pack|estuche/i.test(conflict))
    || !sameSet(productPackaging, externalPackaging)) {
    return { rank: 5, kind: "pack_unit", reason: "Revisar pack, estuche o unidad", score: score(5) };
  }
  return { rank: 6, kind: "confidence", reason: "Menor confianza; revisión general", score: score(6) };
}

export function normalizeImageMatchText(value: string) {
  return replaceAliases(value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR"))
    .replace(/&(?:amp|#38);/g, " y ")
    .replace(/\bx(?=\d)/g, "x ")
    .replace(/(\d)(?=ml|cc|cl|lt?\b)/g, "$1 ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function volumeMl(value: string) {
  const normalized = normalizeImageMatchText(value);
  const match = normalized.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(ml|cc|cl|l|lt|litros?)(?:\s|$)/);
  if (!match) return null;
  const amount = Number(match[1].replace(",", "."));
  if (!Number.isFinite(amount)) return null;
  if (match[2] === "l" || match[2] === "lt" || match[2].startsWith("litro")) return Math.round(amount * 1000);
  if (match[2] === "cl") return Math.round(amount * 10);
  return Math.round(amount);
}

function markers(value: string, vocabulary: readonly string[]) {
  const normalized = ` ${normalizeImageMatchText(value)} `;
  return vocabulary.filter((token) => normalized.includes(` ${token} `));
}

function packaging(value: string) {
  const normalized = normalizeImageMatchText(value);
  const flags = new Set<string>();
  if (/\b(?:pack|caja|combo)\b/.test(normalized) || /\bx\s*(?:2|3|4|6|8|12|18|24)\s*(?:u|unid|unidades|botellas|latas)?\b/.test(normalized)) flags.add("pack");
  if (/\b(?:estuche|cofre|gift|regalo)\b/.test(normalized)) flags.add("estuche");
  if (/\b(?:lata|can)\b/.test(normalized)) flags.add("lata");
  if (/\b(?:copa|vaso|jarro|decanter|sacacorchos)\b/.test(normalized)) flags.add("accesorio");
  return [...flags].sort();
}

function tokenSet(value: string) {
  const normalized = normalizeImageMatchText(value)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cc|cl|l|lt|litros?|gr|g|kg|oz)\b/g, " ");
  return new Set(normalized.split(" ").filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function intersect(left: Set<string>, right: Set<string>) {
  const common: string[] = [];
  for (const token of left) if (right.has(token)) common.push(token);
  return common;
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function firstDistinctiveToken(value: string) {
  return normalizeImageMatchText(value).split(" ")
    .find((token) => token.length > 1 && !STOP_WORDS.has(token) && !/^\d+$/.test(token));
}

function rounded(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

export function comparePublicCatalogImage(
  product: ImageMatchProduct,
  external: PublicCatalogImage,
): ImageMatchResult {
  const productText = `${product.name} ${product.presentation}`;
  const externalText = `${external.name} ${external.presentation ?? ""}`;
  const productVolume = volumeMl(productText);
  const externalVolume = volumeMl(externalText);
  const productVarietals = markers(productText, VARIETALS);
  const externalVarietals = markers(externalText, VARIETALS);
  const productLines = markers(productText, LINE_MARKERS);
  const externalLines = markers(externalText, LINE_MARKERS);
  const productPackaging = packaging(productText);
  const externalPackaging = packaging(externalText);
  const productTokens = tokenSet(productText);
  const externalTokens = tokenSet(externalText);
  const common = intersect(productTokens, externalTokens);
  const productCoverage = productTokens.size ? common.length / productTokens.size : 0;
  const candidateCoverage = externalTokens.size ? common.length / externalTokens.size : 0;
  const union = new Set([...productTokens, ...externalTokens]).size;
  const jaccard = union ? common.length / union : 0;
  const hardConflicts: string[] = [];

  if (productVolume && externalVolume && productVolume !== externalVolume) hardConflicts.push("volumen diferente");
  if (productVarietals.length && externalVarietals.length && !sameSet(productVarietals, externalVarietals)) {
    hardConflicts.push("varietal diferente");
  }
  if ((productLines.length || externalLines.length) && !sameSet(productLines, externalLines)) {
    hardConflicts.push("línea claramente diferente");
  }
  if (!sameSet(productPackaging, externalPackaging)) {
    if (productPackaging.includes("pack") || externalPackaging.includes("pack")) hardConflicts.push("pack/unidad");
    if (productPackaging.includes("estuche") || externalPackaging.includes("estuche")) hardConflicts.push("estuche/botella");
    if (productPackaging.includes("accesorio") || externalPackaging.includes("accesorio")) hardConflicts.push("producto diferente");
    if (productPackaging.includes("lata") !== externalPackaging.includes("lata")) hardConflicts.push("presentación diferente");
  }
  const brandToken = firstDistinctiveToken(product.name);
  if (brandToken && !externalTokens.has(brandToken)) hardConflicts.push("marca diferente");
  if (productCoverage < 0.55 || common.length < Math.min(2, productTokens.size)) hardConflicts.push("producto diferente");

  const uniqueConflicts = [...new Set(hardConflicts)];
  const volumeMatch = Boolean(productVolume && externalVolume && productVolume === externalVolume);
  const varietalMatch = Boolean(productVarietals.length && sameSet(productVarietals, externalVarietals));
  const exactCore = productTokens.size === externalTokens.size && productCoverage === 1;
  const exact = uniqueConflicts.length === 0 && exactCore && (!productVolume || !externalVolume || volumeMatch);
  let confidence = (productCoverage * 0.58) + (candidateCoverage * 0.16) + (jaccard * 0.16);
  if (volumeMatch) confidence += 0.06;
  if (varietalMatch) confidence += 0.04;
  if (exact) confidence = Math.max(confidence, 0.95);
  if (!externalVolume && productVolume) confidence = Math.min(confidence, 0.86);
  if (uniqueConflicts.length) confidence = Math.min(confidence, 0.69);
  confidence = rounded(confidence);
  const band: MatchConfidenceBand = confidence >= 0.9
    ? "high"
    : confidence >= 0.72
      ? "medium"
      : confidence >= 0.48
        ? "low"
        : "none";
  const matchedFields = [
    `nombre ${Math.round(productCoverage * 100)}%`,
    ...(brandToken && externalTokens.has(brandToken) ? [`marca ${brandToken}`] : []),
    ...(volumeMatch ? [`presentación ${productVolume} ml`] : []),
    ...(varietalMatch ? [`varietal ${productVarietals.join("/")}`] : []),
    `fuente ${external.tier}`,
  ];
  return {
    product,
    external,
    confidence,
    band,
    exact,
    matchedFields,
    hardConflicts: uniqueConflicts,
    needsReview: band === "medium",
  };
}

export function bestPublicCatalogMatch(
  product: ImageMatchProduct,
  catalog: PublicCatalogImage[],
): ImageMatchResult {
  const ranked = catalog
    .map((external) => comparePublicCatalogImage(product, external))
    .sort((left, right) => right.confidence - left.confidence);
  const best = ranked[0];
  if (!best || best.band === "none") {
    return { product, confidence: 0, band: "none", exact: false, matchedFields: [], hardConflicts: [], needsReview: false };
  }
  const runnerUp = ranked[1];
  if (runnerUp && best.band === "high" && best.confidence - runnerUp.confidence < 0.035 && best.external?.sourceUrl !== runnerUp.external?.sourceUrl) {
    return { ...best, confidence: 0.89, band: "medium", exact: false, needsReview: true, matchedFields: [...best.matchedFields, "match cercano alternativo"] };
  }
  return best;
}

export function visualVariantForSku(sku: string): LombardoVisualVariant {
  const prefix = sku.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";
  if (["ACC", "BLO", "BOL"].includes(prefix)) return "gifts";
  if (prefix === "CER") return "beer";
  if (SPIRITS_PREFIXES.includes(prefix)) return "spirits";
  if (GOURMET_PREFIXES.includes(prefix)) return "gourmet";
  return "wine";
}
