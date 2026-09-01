import { readFileSync } from "node:fs";
import {
  comparePublicCatalogImage,
  reviewRiskForMatch,
  visualVariantForSku,
  type ImageMatchProduct,
  type PublicCatalogImage,
} from "../lib/images/mass-image-matcher.ts";

interface PendingCandidate {
  id: string;
  productId: string;
  sku: string;
  productName: string;
  presentation: string;
  imageUrl: string;
  sourceUrl: string;
}

const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "https://www.lombardomercato.com").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const tokenFile = process.env.IMAGE_JOB_TOKEN_FILE || "";
const token = tokenFile ? readFileSync(tokenFile, "utf8").trim() : "";
const runId = process.env.IMAGE_JOB_RUN_ID || "";
const confirmation = process.env.IMAGE_RECOVERY_CONFIRM || "";

if (
  !jobId || token.length < 43 ||
  !/^mass-image-coverage-phase2-[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(runId) ||
  confirmation !== "RECOVER_OWNER_APPROVED_PENDING_IMAGES"
) {
  throw new Error("Missing protected pending-image recovery confirmation.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function jobRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}/api/admin/image-jobs/${jobId}/publish${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init.headers,
    },
    signal: AbortSignal.timeout(65_000),
  });
  if (!response.ok) throw new Error(`Protected image job failed: HTTP ${response.status}`);
  return response;
}

async function loadPending() {
  const candidates: PendingCandidate[] = [];
  let offset = 0;
  while (true) {
    const response = await jobRequest(`?queue=approved&runId=${runId}&offset=${offset}&limit=100`);
    const page = await response.json() as { candidates: PendingCandidate[]; hasMore: boolean; limit: number };
    candidates.push(...page.candidates);
    if (!page.hasMore || !page.candidates.length) break;
    offset += page.limit;
  }
  return candidates;
}

function decodeHtml(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchQueries(product: ImageMatchProduct) {
  const name = product.name.replace(/c[.]?c[.]?/gi, "ml").replace(/\s+/g, " ").trim();
  const presentation = product.presentation.replace(/c[.]?c[.]?/gi, "ml").trim();
  return [
    `"${name}" ${presentation} producto`,
    `"${name}" botella`,
    `${name} ${presentation}`,
  ];
}

function duckResults(value: unknown): PublicCatalogImage[] {
  if (!value || typeof value !== "object") return [];
  const payload = value as { results?: Array<{ image?: unknown; title?: unknown; url?: unknown }> };
  if (!Array.isArray(payload.results)) return [];
  return payload.results.flatMap((result, index) => {
    if (typeof result.image !== "string" || typeof result.title !== "string" || typeof result.url !== "string") return [];
    try {
      const sourceUrl = new URL(result.url);
      const imageUrl = new URL(result.image);
      if (sourceUrl.protocol !== "https:" || imageUrl.protocol !== "https:") return [];
      const title = decodeHtml(result.title);
      return [{
        key: `${sourceUrl.href}#recovery-${index}`,
        source: "commercial_search_recovery",
        tier: "commercial" as const,
        sourceUrl: sourceUrl.href,
        imageUrl: imageUrl.href,
        name: title,
        presentation: title,
      }];
    } catch {
      return [];
    }
  });
}

async function imageIsReachable(imageUrl: string) {
  try {
    const response = await fetch(imageUrl, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        accept: "image/avif,image/webp,image/png,image/jpeg",
      },
      signal: AbortSignal.timeout(10_000),
    });
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const declaredBytes = Number(response.headers.get("content-length") || 0);
    await response.body?.cancel();
    return response.ok && ["image/jpeg", "image/png", "image/webp", "image/avif"].includes(mimeType)
      && declaredBytes <= 5 * 1024 * 1024;
  } catch {
    return false;
  }
}

async function searchReplacement(product: ImageMatchProduct, rejectedUrls: Set<string>) {
  for (const rawQuery of searchQueries(product)) {
    try {
      const query = encodeURIComponent(rawQuery);
      const searchPage = await fetch(`https://duckduckgo.com/?q=${query}&iax=images&ia=images`, {
        headers: { "user-agent": "Mozilla/5.0 Chrome/126", accept: "text/html" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!searchPage.ok) continue;
      const html = await searchPage.text();
      const vqd = html.match(/vqd=["']([^"'&]+)/)?.[1] || html.match(/vqd=([^&"'\s]+)/)?.[1];
      if (!vqd) continue;
      const response = await fetch(`https://duckduckgo.com/i.js?l=ar-es&o=json&q=${query}&vqd=${encodeURIComponent(vqd)}`, {
        headers: { "user-agent": "Mozilla/5.0 Chrome/126", referer: "https://duckduckgo.com/", accept: "application/json" },
        signal: AbortSignal.timeout(12_000),
      });
      if (!response.ok) continue;
      const matches = duckResults(await response.json())
        .filter((external) => !rejectedUrls.has(external.imageUrl) && !rejectedUrls.has(external.sourceUrl))
        .map((external) => comparePublicCatalogImage(product, external))
        .filter((match) => match.hardConflicts.length === 0 && match.confidence >= 0.72)
        .sort((left, right) => right.confidence - left.confidence);
      for (const match of matches.slice(0, 8)) {
        if (match.external && await imageIsReachable(match.external.imageUrl)) return match;
      }
    } catch {
      // Continue with the next exact query variant.
    }
  }
  return null;
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

const pending = await loadPending();
const rejectedUrls = new Set(pending.flatMap((candidate) => [candidate.imageUrl, candidate.sourceUrl]));
console.log(JSON.stringify({ stage: "recovery-search", pending: pending.length }));
const recovered = await mapLimit(pending, 4, async (candidate, index) => {
  const product: ImageMatchProduct = {
    id: candidate.productId,
    sku: candidate.sku,
    name: candidate.productName,
    presentation: candidate.presentation,
  };
  const match = await searchReplacement(product, rejectedUrls);
  if ((index + 1) % 20 === 0 || index + 1 === pending.length) {
    console.log(JSON.stringify({ stage: "recovery-search", processed: index + 1, total: pending.length }));
  }
  await delay(120);
  return match;
});

const items = recovered.flatMap((match) => {
  if (!match?.external) return [];
  const risk = reviewRiskForMatch(match);
  return [{
    productId: match.product.id,
    source: "commercial_search_recovery",
    sourceTier: "commercial",
    sourceProductKey: match.external.key,
    sourceUrl: match.external.sourceUrl,
    imageUrl: match.external.imageUrl,
    externalProductName: match.external.name,
    externalPresentation: match.external.presentation || match.external.name,
    confidence: match.confidence,
    exact: match.exact,
    autoPublish: true,
    needsReview: match.confidence < 0.9,
    matchedFields: match.matchedFields,
    mismatchWarnings: [],
    hardConflicts: [],
    visualVariant: visualVariantForSku(match.product.sku),
    reviewRiskRank: risk.rank,
    reviewRiskKind: risk.kind,
    reviewRiskReason: risk.reason,
    reviewPriorityScore: risk.score,
    reviewRiskVersion: 2,
    runId,
  }];
});

const candidateIds: string[] = [];
for (let index = 0; index < items.length; index += 25) {
  const response = await jobRequest("", { method: "PUT", body: JSON.stringify({ items: items.slice(index, index + 25) }) });
  const result = await response.json() as { imported: Array<{ candidate_id: string; auto_publish: boolean }> };
  candidateIds.push(...result.imported.filter((item) => item.auto_publish).map((item) => item.candidate_id));
}

let published = 0;
let remaining = [...candidateIds];
for (let pass = 0; pass < 2 && remaining.length; pass += 1) {
  const retry: string[] = [];
  for (let index = 0; index < remaining.length; index += 12) {
    const group = remaining.slice(index, index + 12);
    const batches = Array.from({ length: Math.ceil(group.length / 2) }, (_, batchIndex) =>
      group.slice(batchIndex * 2, (batchIndex + 1) * 2));
    const results = await Promise.all(batches.map(async (batch) => {
      try {
        const response = await jobRequest("", { method: "POST", body: JSON.stringify({ candidateIds: batch }) });
        return await response.json() as { published: number; failures: Array<{ candidateId: string }> };
      } catch {
        return { published: 0, failures: batch.map((candidateId) => ({ candidateId })) };
      }
    }));
    for (const result of results) {
      published += result.published;
      retry.push(...result.failures.map((failure) => failure.candidateId));
    }
  }
  remaining = [...new Set(retry)];
}

console.log(JSON.stringify({
  stage: "recovery-complete",
  searched: pending.length,
  matches: items.length,
  published,
  publicationFailures: remaining.length,
  noReplacement: pending.length - items.length,
}));
