import { createHash } from "node:crypto";
import type { ExternalCompetitorProduct } from "./types";

const PRODUCTS_MARKER = /\bproducts\s*:\s*\[/g;

interface BalancedPart {
  value: string;
  end: number;
}

export interface PositanoPageParseResult {
  products: ExternalCompetitorProduct[];
  objectsDetected: number;
  pagesDiscovered: number;
  structuralSignature: string;
}

function balancedPart(source: string, start: number, open: string, close: string): BalancedPart | null {
  if (source[start] !== open) return null;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close) {
      depth -= 1;
      if (depth === 0) return { value: source.slice(start, index + 1), end: index + 1 };
    }
  }
  return null;
}

function objectParts(arraySource: string) {
  const objects: string[] = [];
  let index = 1;
  while (index < arraySource.length - 1) {
    if (arraySource[index] !== "{") {
      index += 1;
      continue;
    }
    const part = balancedPart(arraySource, index, "{", "}");
    if (!part) break;
    objects.push(part.value);
    index = part.end;
  }
  return objects;
}

function jsString(source: string, key: string) {
  const pattern = new RegExp(`\\b${key}\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`);
  const encoded = source.match(pattern)?.[1];
  if (!encoded) return undefined;
  try {
    return JSON.parse(encoded) as string;
  } catch {
    return undefined;
  }
}

function localizedString(source: string, key: string) {
  const pattern = new RegExp(`\\b${key}\\s*:\\s*\\{\\s*"es"\\s*:\\s*("(?:\\\\.|[^"\\\\])*")`);
  const encoded = source.match(pattern)?.[1];
  if (!encoded) return undefined;
  try {
    return JSON.parse(encoded) as string;
  } catch {
    return undefined;
  }
}

function numberValue(source: string, key: string) {
  const raw = source.match(new RegExp(`\\b${key}\\s*:\\s*(?:"([0-9.]+)"|(-?[0-9.]+))`));
  const value = Number(raw?.[1] ?? raw?.[2]);
  return Number.isFinite(value) ? value : undefined;
}

function booleanValue(source: string, key: string) {
  const value = source.match(new RegExp(`\\b${key}\\s*:\\s*(true|false)`))?.[1];
  return value === "true" ? true : value === "false" ? false : undefined;
}

function nestedArray(source: string, key: string) {
  const marker = new RegExp(`\\b${key}\\s*:\\s*\\[`, "g");
  const match = marker.exec(source);
  if (!match) return null;
  return balancedPart(source, match.index + match[0].lastIndexOf("["), "[", "]")?.value ?? null;
}

function topLevelKeys(source: string) {
  const keys = new Set<string>();
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === "{" || character === "[") depth += 1;
    if (character === "}" || character === "]") depth -= 1;
    if (depth !== 1) continue;
    const key = source.slice(index).match(/^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/)?.[1];
    if (key) keys.add(key);
  }
  return [...keys].sort();
}

function promotion(currentPrice: number | undefined, listPrice: number | undefined) {
  if (!currentPrice || !listPrice || listPrice <= currentPrice) return undefined;
  const percentage = Math.round((1 - (currentPrice / listPrice)) * 100);
  return percentage > 0 ? `${percentage}% OFF` : undefined;
}

function normalizedText(value: string | undefined) {
  const text = value?.trim().replace(/\s+/g, " ");
  return text || undefined;
}

function allowedProductUrl(value: string | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !["positanovinos.com.ar", "www.positanovinos.com.ar"].includes(url.hostname)) return undefined;
    if (!url.pathname.startsWith("/productos/")) return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseProductObject(source: string, fetchedAt: string) {
  const productId = numberValue(source, "id");
  const externalName = normalizedText(localizedString(source, "name"));
  const externalProductUrl = allowedProductUrl(jsString(source, "canonical_url"));
  const brand = normalizedText(jsString(source, "brand"));
  const variantsSource = nestedArray(source, "variants");
  if (!productId || !externalName || !externalProductUrl || !variantsSource) return [];
  const variants = objectParts(variantsSource);
  return variants.flatMap((variant, variantIndex): ExternalCompetitorProduct[] => {
    const variantId = numberValue(variant, "id");
    if (!variantId) return [];
    const currentPrice = numberValue(variant, "price");
    const compareAtPrice = numberValue(variant, "compare_at_price");
    const listPrice = compareAtPrice && currentPrice && compareAtPrice > currentPrice
      ? compareAtPrice
      : undefined;
    const stock = numberValue(variant, "stock");
    const stockManaged = booleanValue(variant, "stock_management");
    const values = [...variant.matchAll(/\{\s*"es"\s*:\s*("(?:\\.|[^"\\])*")\s*\}/g)]
      .flatMap((match) => {
        try { return [JSON.parse(match[1]) as string]; } catch { return []; }
      });
    const suffix = variants.length > 1 && values.length ? ` · ${values.join(" / ")}` : "";
    const ean = normalizedText(jsString(variant, "barcode"));
    const externalSku = normalizedText(jsString(variant, "sku"));
    const available = stockManaged === true ? (stock ?? 0) > 0 : true;
    return [{
      externalId: `${productId}:${variantId}`,
      externalProductUrl,
      externalName: `${externalName}${suffix}`,
      brand,
      presentation: values.join(" / ") || undefined,
      ean,
      externalSku,
      currentPrice: currentPrice && currentPrice > 0 ? currentPrice : undefined,
      listPrice,
      promotionText: promotion(currentPrice, listPrice),
      available,
      fetchedAt,
      raw: {
        productId,
        variantId,
        variantIndex,
        stock: stock ?? null,
        stockManaged: stockManaged ?? null,
        values,
      },
    }];
  });
}

export function parsePositanoCatalogPage(html: string, fetchedAt: string): PositanoPageParseResult {
  PRODUCTS_MARKER.lastIndex = 0;
  const marker = PRODUCTS_MARKER.exec(html);
  if (!marker) {
    return { products: [], objectsDetected: 0, pagesDiscovered: 0, structuralSignature: "missing-products-marker" };
  }
  const arrayStart = marker.index + marker[0].lastIndexOf("[");
  const productsArray = balancedPart(html, arrayStart, "[", "]")?.value;
  if (!productsArray) {
    return { products: [], objectsDetected: 0, pagesDiscovered: 0, structuralSignature: "unbalanced-products-array" };
  }
  const objects = objectParts(productsArray);
  const products = objects.flatMap((object) => parseProductObject(object, fetchedAt));
  const pageNumbers = [...html.matchAll(/\/productos\/page\/(\d+)\//g)]
    .map((match) => Number(match[1]))
    .filter(Number.isFinite);
  const pagesDiscovered = Math.max(1, ...pageNumbers);
  const productKeys = [...new Set(objects.slice(0, 8).flatMap(topLevelKeys))].sort();
  const variantKeys = [...new Set(objects.slice(0, 8).flatMap((object) => {
    const array = nestedArray(object, "variants");
    return array ? objectParts(array).slice(0, 2).flatMap(topLevelKeys) : [];
  }))].sort();
  const structuralSignature = createHash("sha256")
    .update(JSON.stringify({ marker: "nube-sdk-products", productKeys, variantKeys }))
    .digest("hex");
  return { products, objectsDetected: objects.length, pagesDiscovered, structuralSignature };
}

export function robotsAllowsProducts(robots: string) {
  let applies = false;
  for (const rawLine of robots.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const [rawKey, ...rawValue] = line.split(":");
    const key = rawKey.trim().toLocaleLowerCase("en-US");
    const value = rawValue.join(":").trim();
    if (key === "user-agent") {
      applies = value === "*";
      continue;
    }
    if (applies && key === "disallow" && value && "/productos/".startsWith(value)) return false;
  }
  return true;
}
