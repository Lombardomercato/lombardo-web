import {
  normalizeImageMatchText,
  volumeMl,
} from "../images/mass-image-matcher.ts";
import type {
  CompetitorMatchDecision,
  ExternalCompetitorProduct,
  RuniaCompetitorProduct,
} from "./types";

const STOP_WORDS = new Set([
  "vino", "vinos", "botella", "botellas", "unidad", "unidades", "x", "de", "del",
  "la", "las", "el", "los", "con", "sin", "cc", "ml", "lt", "l", "argentina",
]);

const VARIETALS = [
  "cabernet sauvignon", "cabernet franc", "sauvignon blanc", "pinot noir", "petit verdot",
  "brut nature", "extra brut", "malbec", "chardonnay", "merlot", "syrah", "shiraz",
  "bonarda", "tempranillo", "tannat", "torrontes", "ancellotta", "riesling", "viognier",
  "semillon", "chenin", "moscatel", "rose", "rosado", "brut", "blend", "corte",
] as const;

const LINE_MARKERS = [
  "gran reserva", "grand reserve", "single vineyard", "reserva", "reserve", "coleccion",
  "collection", "alta", "altitud", "estate", "icono", "premium", "roble", "clasico",
  "millesime", "blanc de blancs", "golden reserve", "family reserve", "edicion limitada",
] as const;

const PACKAGING = ["pack", "caja", "combo", "estuche", "cofre", "lata", "bag in box"] as const;

interface Features {
  normalized: string;
  tokens: Set<string>;
  brand: string;
  volume: number | null;
  varietals: string[];
  lines: string[];
  packaging: string[];
}

interface PreparedRuniaProduct {
  product: RuniaCompetitorProduct;
  features: Features;
}

function markers(value: string, vocabulary: readonly string[]) {
  const normalized = ` ${normalizeImageMatchText(value)} `;
  return vocabulary.filter((marker) => normalized.includes(` ${marker} `));
}

function tokens(value: string) {
  return new Set(
    normalizeImageMatchText(value)
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:ml|cc|cl|l|lt|litros?)\b/g, " ")
      .split(" ")
      .filter((token) => token.length > 1 && !STOP_WORDS.has(token)),
  );
}

function normalizedBrand(explicit: string | undefined, name: string) {
  if (explicit?.trim()) return normalizeImageMatchText(explicit);
  return normalizeImageMatchText(name).split(" ")[0] ?? "";
}

function features(input: {
  name: string;
  presentation?: string;
  brand?: string;
}): Features {
  const full = `${input.name} ${input.presentation ?? ""}`;
  return {
    normalized: normalizeImageMatchText(full),
    tokens: tokens(full),
    brand: normalizedBrand(input.brand, input.name),
    volume: volumeMl(full),
    varietals: markers(full, VARIETALS),
    lines: markers(full, LINE_MARKERS),
    packaging: markers(full, PACKAGING),
  };
}

function sameSet(left: string[], right: string[]) {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function intersectionSize(left: Set<string>, right: Set<string>) {
  let common = 0;
  for (const token of left) if (right.has(token)) common += 1;
  return common;
}

function rounded(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function comparableIdentifier(value: string | undefined) {
  const normalized = value?.replace(/[^a-zA-Z0-9]/g, "").toLocaleUpperCase("en-US");
  return normalized && normalized.length >= 4 ? normalized : undefined;
}

function compare(
  external: ExternalCompetitorProduct,
  externalFeatures: Features,
  candidate: PreparedRuniaProduct,
): CompetitorMatchDecision {
  const runia = candidate.product;
  const runiaFeatures = candidate.features;
  const externalEan = comparableIdentifier(external.ean);
  const runiaEan = comparableIdentifier(runia.ean);
  const externalSku = comparableIdentifier(external.externalSku);
  const runiaSku = comparableIdentifier(runia.sku);
  const exactEan = Boolean(externalEan && runiaEan && externalEan === runiaEan);
  const exactSku = Boolean(externalSku && runiaSku && externalSku === runiaSku);
  const common = intersectionSize(externalFeatures.tokens, runiaFeatures.tokens);
  const externalCoverage = externalFeatures.tokens.size ? common / externalFeatures.tokens.size : 0;
  const runiaCoverage = runiaFeatures.tokens.size ? common / runiaFeatures.tokens.size : 0;
  const union = new Set([...externalFeatures.tokens, ...runiaFeatures.tokens]).size;
  const jaccard = union ? common / union : 0;
  const brandMatch = Boolean(
    externalFeatures.brand && runiaFeatures.brand &&
    (externalFeatures.brand === runiaFeatures.brand ||
      externalFeatures.normalized.includes(runiaFeatures.brand) ||
      runiaFeatures.normalized.includes(externalFeatures.brand)),
  );
  const volumeMatch = Boolean(
    externalFeatures.volume && runiaFeatures.volume &&
    externalFeatures.volume === runiaFeatures.volume,
  );
  const varietalMatch = Boolean(
    externalFeatures.varietals.length &&
    sameSet(externalFeatures.varietals, runiaFeatures.varietals),
  );
  const conflicts: string[] = [];

  if (externalFeatures.volume && runiaFeatures.volume && !volumeMatch) conflicts.push("volumen diferente");
  if (externalFeatures.varietals.length && runiaFeatures.varietals.length && !varietalMatch) {
    conflicts.push("varietal diferente");
  }
  if ((externalFeatures.lines.length || runiaFeatures.lines.length) &&
    !sameSet(externalFeatures.lines, runiaFeatures.lines)) {
    conflicts.push("línea diferente");
  }
  if (!sameSet(externalFeatures.packaging, runiaFeatures.packaging)) conflicts.push("pack/presentación diferente");
  if (externalFeatures.brand && runiaFeatures.brand && !brandMatch) conflicts.push("marca diferente");
  if (common < Math.min(2, externalFeatures.tokens.size, runiaFeatures.tokens.size)) {
    conflicts.push("identidad insuficiente");
  }

  let confidence = (externalCoverage * 0.44) + (runiaCoverage * 0.22) + (jaccard * 0.12);
  if (brandMatch) confidence += 0.09;
  if (volumeMatch) confidence += 0.07;
  if (varietalMatch) confidence += 0.06;
  if (exactSku) confidence = Math.max(confidence, 0.97);
  if (exactEan) confidence = Math.max(confidence, 0.995);
  if (conflicts.length && !exactEan) confidence = Math.min(confidence, 0.59);
  confidence = rounded(confidence);
  const band = confidence >= 0.9 ? "high" : confidence >= 0.72 ? "medium" : confidence >= 0.48 ? "low" : "none";
  return {
    runiaProductId: band === "high" || band === "medium" ? runia.id : undefined,
    suggestedRuniaProductId: band === "low" ? runia.id : undefined,
    confidence,
    band,
    matchedFields: [
      `nombre ${Math.round(externalCoverage * 100)}%`,
      ...(brandMatch ? [`marca ${externalFeatures.brand}`] : []),
      ...(volumeMatch ? [`presentación ${externalFeatures.volume} ml`] : []),
      ...(varietalMatch ? [`varietal ${externalFeatures.varietals.join("/")}`] : []),
      ...(exactSku ? ["SKU exacto"] : []),
      ...(exactEan ? ["EAN exacto"] : []),
    ],
    conflicts: [...new Set(conflicts)],
  };
}

export function buildCompetitorMatcher(products: RuniaCompetitorProduct[]) {
  const prepared = products.map((product) => ({
    product,
    features: features({ name: product.name, presentation: product.presentation, brand: product.brand }),
  }));
  const byEan = new Map(prepared.flatMap((item) => {
    const ean = comparableIdentifier(item.product.ean);
    return ean ? [[ean, item] as const] : [];
  }));
  const bySku = new Map(prepared.flatMap((item) => {
    const sku = comparableIdentifier(item.product.sku);
    return sku ? [[sku, item] as const] : [];
  }));
  const tokenIndex = new Map<string, Set<number>>();
  prepared.forEach((item, index) => {
    for (const token of item.features.tokens) {
      const values = tokenIndex.get(token) ?? new Set<number>();
      values.add(index);
      tokenIndex.set(token, values);
    }
  });

  return (external: ExternalCompetitorProduct): CompetitorMatchDecision => {
    const externalFeatures = features({
      name: external.externalName,
      presentation: external.presentation,
      brand: external.brand,
    });
    const exact = byEan.get(comparableIdentifier(external.ean) ?? "") ??
      bySku.get(comparableIdentifier(external.externalSku) ?? "");
    let candidates: PreparedRuniaProduct[];
    if (exact) {
      candidates = [exact];
    } else {
      const overlap = new Map<number, number>();
      for (const token of externalFeatures.tokens) {
        for (const index of tokenIndex.get(token) ?? []) {
          overlap.set(index, (overlap.get(index) ?? 0) + 1);
        }
      }
      candidates = [...overlap.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 48)
        .map(([index]) => prepared[index]);
    }
    const ranked = candidates
      .map((candidate) => compare(external, externalFeatures, candidate))
      .sort((left, right) => right.confidence - left.confidence);
    const best = ranked[0];
    if (!best || best.band === "none") {
      return { confidence: best?.confidence ?? 0, band: "none", matchedFields: [], conflicts: best?.conflicts ?? [] };
    }
    const runnerUp = ranked[1];
    if (!runnerUp) return best;
    const margin = best.confidence - runnerUp.confidence;
    if (best.band === "high" && margin < 0.06) {
      return {
        ...best,
        runiaProductId: best.runiaProductId,
        confidence: 0.89,
        band: "medium",
        runnerUpConfidence: runnerUp.confidence,
        matchedFields: [...best.matchedFields, "alternativa cercana"],
      };
    }
    if (best.band === "medium" && margin < 0.025) {
      return {
        ...best,
        runiaProductId: undefined,
        suggestedRuniaProductId: best.runiaProductId ?? best.suggestedRuniaProductId,
        confidence: Math.min(best.confidence, 0.71),
        band: "low",
        runnerUpConfidence: runnerUp.confidence,
        matchedFields: [...best.matchedFields, "match ambiguo"],
      };
    }
    return { ...best, runnerUpConfidence: runnerUp.confidence };
  };
}

export function priceDifference(lombardoRetail: number, competitorPrice: number) {
  if (!Number.isFinite(lombardoRetail) || !Number.isFinite(competitorPrice) || competitorPrice <= 0) {
    return {};
  }
  const amount = Math.round((lombardoRetail - competitorPrice) * 100) / 100;
  const percentage = Math.round(((amount / competitorPrice) * 100) * 100) / 100;
  return { amount, percentage };
}
