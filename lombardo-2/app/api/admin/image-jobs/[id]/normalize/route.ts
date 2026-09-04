import "server-only";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminStore } from "@/lib/server/admin/admin-auth";
import { createNormalizedProductRender } from "@/lib/server/images/normalized-product-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH_SIZE = 12;
const NORMALIZATION_CONCURRENCY = 3;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function authorizedStore(request: Request, jobId: string) {
  if (!UUID_PATTERN.test(jobId)) return null;
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization);
  if (!match) return null;
  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const store = createAdminStore();
  return await store.authorizeImageJob(jobId, tokenHash) ? store : null;
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const store = await authorizedStore(request, jobId);
  if (!store) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  let body: { cursor?: unknown; limit?: unknown };
  try {
    body = await request.json() as { cursor?: unknown; limit?: unknown };
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const cursor = typeof body.cursor === "string" && UUID_PATTERN.test(body.cursor) ? body.cursor : undefined;
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_BATCH_SIZE)
    : MAX_BATCH_SIZE;
  const media = await store.listPrimaryProductMediaForNormalization({ cursor, limit });
  const results: Array<{ mediaId: string; status: "published" | "needs_review" | "failed" }> = [];

  for (let offset = 0; offset < media.length; offset += NORMALIZATION_CONCURRENCY) {
    const group = media.slice(offset, offset + NORMALIZATION_CONCURRENCY);
    const groupResults = await Promise.all(group.map(async (item) => {
      try {
        const response = await fetch(item.sourceUrl, {
          headers: { Accept: "image/avif,image/webp,image/png,image/jpeg" },
          cache: "no-store",
          signal: AbortSignal.timeout(12_000),
        });
        const declaredBytes = Number(response.headers.get("content-length") || 0);
        if (!response.ok || declaredBytes > 5 * 1024 * 1024) throw new Error("source_unavailable");
        const source = new Uint8Array(await response.arrayBuffer());
        if (source.byteLength < 20 || source.byteLength > 5 * 1024 * 1024) throw new Error("invalid_source_size");
        const render = await createNormalizedProductRender(source);
        if (render.status === "needs_review") return { mediaId: item.id, status: "needs_review" as const };
        await store.uploadNormalizedProductRender({
          sourceMediaId: item.id,
          productId: item.productId,
          bytes: render.bytes,
          contentSha256: createHash("sha256").update(render.bytes).digest("hex"),
          backgroundConfidence: render.confidence,
          edgeCoverage: render.edgeCoverage,
          operatorUserId: null,
          jobId,
        });
        return { mediaId: item.id, status: "published" as const };
      } catch {
        return { mediaId: item.id, status: "failed" as const };
      }
    }));
    results.push(...groupResults);
  }

  if (results.some((result) => result.status === "published")) revalidateTag("runia-real-catalog", "max");
  return NextResponse.json({
    processed: results.length,
    published: results.filter((result) => result.status === "published").length,
    needsReview: results.filter((result) => result.status === "needs_review").length,
    failed: results.filter((result) => result.status === "failed").length,
    cursor: media.at(-1)?.id ?? cursor ?? null,
    complete: media.length < limit,
    results,
  });
}
