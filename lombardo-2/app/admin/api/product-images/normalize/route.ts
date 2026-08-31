import "server-only";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import sharp from "sharp";
import {
  LOMBARDO_RENDER_HEIGHT,
  LOMBARDO_RENDER_WIDTH,
  alphaBounds,
  fitInsideLombardoCanvas,
  removeEdgeConnectedBackground,
} from "@/lib/images/normalize-product-master";
import { createAdminStore, requireAdminRole } from "@/lib/server/admin/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return fetchSite === "same-origin" && origin === new URL(request.url).origin;
}

async function normalizedRender(source: Uint8Array) {
  const decoded = await sharp(source, { limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const removed = removeEdgeConnectedBackground({
    data: decoded.data,
    width: decoded.info.width,
    height: decoded.info.height,
    channels: 4,
  });
  const bounds = alphaBounds(removed);
  if (!bounds || removed.confidence === "low") {
    return { status: "needs_review" as const, confidence: removed.confidence, edgeCoverage: removed.edgeCoverage };
  }
  const placement = fitInsideLombardoCanvas(bounds.width, bounds.height);
  const foreground = await sharp(Buffer.from(removed.data), {
    raw: { width: removed.width, height: removed.height, channels: 4 },
  })
    .extract(bounds)
    .resize(placement.width, placement.height, { fit: "fill" })
    .png()
    .toBuffer();
  const bytes = await sharp({
    create: {
      width: LOMBARDO_RENDER_WIDTH,
      height: LOMBARDO_RENDER_HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: placement.left, top: placement.top }])
    .webp({ quality: 92, alphaQuality: 100 })
    .toBuffer();
  return {
    status: "ready" as const,
    bytes,
    confidence: removed.confidence,
    edgeCoverage: removed.edgeCoverage,
  };
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
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 4)
    : 4;
  const store = createAdminStore();
  const media = await store.listPrimaryProductMediaForNormalization({ cursor, limit });
  const results: Array<{ mediaId: string; status: "published" | "needs_review" | "failed" }> = [];

  for (const item of media) {
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
      const render = await normalizedRender(source);
      if (render.status === "needs_review") {
        results.push({ mediaId: item.id, status: "needs_review" });
        continue;
      }
      await store.uploadNormalizedProductRender({
        sourceMediaId: item.id,
        productId: item.productId,
        bytes: render.bytes,
        contentSha256: createHash("sha256").update(render.bytes).digest("hex"),
        backgroundConfidence: render.confidence,
        edgeCoverage: render.edgeCoverage,
        operatorUserId: session.operatorId,
      });
      results.push({ mediaId: item.id, status: "published" });
    } catch {
      results.push({ mediaId: item.id, status: "failed" });
    }
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
