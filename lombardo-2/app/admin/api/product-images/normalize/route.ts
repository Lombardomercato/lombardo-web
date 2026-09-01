import "server-only";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminStore, requireAdminRole } from "@/lib/server/admin/admin-auth";
import { createNormalizedProductRender } from "@/lib/server/images/normalized-product-render";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_BATCH_SIZE = 12;
const NORMALIZATION_CONCURRENCY = 3;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin" && origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  const session = await requireAdminRole("admin");
  let body: { cursor?: unknown; limit?: unknown };
  try {
    body = await request.json() as { cursor?: unknown; limit?: unknown };
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const cursor = typeof body.cursor === "string" && UUID_PATTERN.test(body.cursor)
    ? body.cursor
    : undefined;
  const requestedLimit = Number(body.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), MAX_BATCH_SIZE)
    : MAX_BATCH_SIZE;
  const store = createAdminStore();
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
        if (render.confidence === "low") {
          return { mediaId: item.id, status: "needs_review" as const };
        }
        if (render.status === "needs_review") {
          return { mediaId: item.id, status: "needs_review" as const };
        }
        await store.uploadNormalizedProductRender({
          sourceMediaId: item.id,
          productId: item.productId,
          bytes: render.bytes,
          contentSha256: createHash("sha256").update(render.bytes).digest("hex"),
          backgroundConfidence: render.confidence,
          edgeCoverage: render.edgeCoverage,
          operatorUserId: session.authUserId,
        });
        return { mediaId: item.id, status: "published" as const };
      } catch {
        return { mediaId: item.id, status: "failed" as const };
      }
    }));
    results.push(...groupResults);
  }

  if (results.some((result) => result.status === "published")) {
    revalidateTag("runia-real-catalog", "max");
  }
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
