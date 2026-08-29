import "server-only";

import { createHash } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { createAdminStore } from "@/lib/server/admin/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BATCH_SIZE = 10;

interface Body {
  candidateIds?: unknown;
  complete?: unknown;
}

function unauthorized() {
  return NextResponse.json({ error: "No autorizado." }, { status: 401 });
}

async function authorizedStore(request: Request, jobId: string) {
  if (!UUID_PATTERN.test(jobId)) return null;
  const authorization = request.headers.get("authorization") || "";
  const match = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(authorization);
  if (!match) return null;
  const tokenHash = createHash("sha256").update(match[1]).digest("hex");
  const store = createAdminStore();
  const job = await store.authorizeImageJob(jobId, tokenHash);
  return job ? store : null;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const store = await authorizedStore(request, jobId);
  if (!store) return unauthorized();
  const url = new URL(request.url);
  const offset = Math.max(0, Math.trunc(Number(url.searchParams.get("offset")) || 0));
  const limit = Math.min(100, Math.max(10, Math.trunc(Number(url.searchParams.get("limit")) || 100)));
  const queue = url.searchParams.get("queue");
  if (queue === "approved") {
    const runId = url.searchParams.get("runId") || undefined;
    if (runId && !/^mass-image-coverage-phase2-[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(runId)) {
      return NextResponse.json({ error: "Run de imágenes inválido." }, { status: 400 });
    }
    const page = await store.listImageCandidates({
      status: "approved",
      publicationStatus: "pending",
      runId,
      offset,
      limit,
    });
    return NextResponse.json(page);
  }
  if (queue === "published") {
    const page = await store.listImageCandidates({
      status: "approved",
      publicationStatus: "approved",
      offset,
      limit,
    });
    return NextResponse.json(page);
  }
  if (queue === "rejected") {
    const page = await store.listImageCandidates({ status: "rejected", offset, limit });
    return NextResponse.json(page);
  }
  const page = await store.listProductsWithoutImageMatch({ offset, limit });
  return NextResponse.json(page);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const store = await authorizedStore(request, jobId);
  if (!store) return unauthorized();
  await store.recordImageJobBatch(jobId, { processed: 0, published: 0, failed: 0, complete: true });
  revalidateTag("runia-real-catalog", "max");
  return NextResponse.json({ complete: true });
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const store = await authorizedStore(request, jobId);
  if (!store) return unauthorized();
  let body: { items?: unknown };
  try {
    body = await request.json() as { items?: unknown };
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 25) {
    return NextResponse.json({ error: "El lote de matching debe contener entre 1 y 25 candidatos." }, { status: 400 });
  }
  const items = body.items as unknown[];
  const imported = await store.importMassImageCandidates(items);
  await store.setMassImageCandidateReviewRisks(imported.map((candidate, index) => {
    const item = items[index] as {
      reviewRiskRank?: unknown;
      reviewRiskKind?: unknown;
      reviewRiskReason?: unknown;
      reviewPriorityScore?: unknown;
      reviewRiskVersion?: unknown;
      runId?: unknown;
    };
    return {
      candidateId: candidate.candidate_id,
      reviewRiskRank: item?.reviewRiskRank,
      reviewRiskKind: item?.reviewRiskKind,
      reviewRiskReason: item?.reviewRiskReason,
      reviewPriorityScore: item?.reviewPriorityScore,
      reviewRiskVersion: item?.reviewRiskVersion,
      runId: item?.runId,
    };
  }));
  return NextResponse.json({ imported });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: jobId } = await context.params;
  const store = await authorizedStore(request, jobId);
  if (!store) return unauthorized();

  let body: Body;
  try {
    body = await request.json() as Body;
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const candidateIds = Array.isArray(body.candidateIds)
    ? [...new Set(body.candidateIds.filter((value): value is string => typeof value === "string" && UUID_PATTERN.test(value)))]
    : [];
  if (!candidateIds.length || candidateIds.length > MAX_BATCH_SIZE) {
    return NextResponse.json({ error: `Cada lote debe contener entre 1 y ${MAX_BATCH_SIZE} candidatos.` }, { status: 400 });
  }

  let published = 0;
  const failures: Array<{ candidateId: string; code: "publication_failed" }> = [];
  for (let index = 0; index < candidateIds.length; index += 2) {
    const slice = candidateIds.slice(index, index + 2);
    const results = await Promise.allSettled(slice.map((candidateId) =>
      store.publishApprovedImageCandidate(candidateId, null)));
    results.forEach((result, resultIndex) => {
      if (result.status === "fulfilled") published += 1;
      else failures.push({ candidateId: slice[resultIndex], code: "publication_failed" });
    });
  }

  const complete = body.complete === true;
  await store.recordImageJobBatch(jobId, {
    processed: candidateIds.length,
    published,
    failed: failures.length,
    errorSummary: failures.length ? `${failures.length} publicaciones fallaron en el último lote.` : undefined,
    complete,
  });
  if (published > 0) revalidateTag("runia-real-catalog", "max");

  return NextResponse.json({
    processed: candidateIds.length,
    published,
    failed: failures.length,
    failures,
    complete,
  });
}
