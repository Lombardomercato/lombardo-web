export {};

import { readFileSync } from "node:fs";

const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "https://www.lombardomercato.com").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const tokenFile = process.env.IMAGE_JOB_TOKEN_FILE || "";
const token = tokenFile ? readFileSync(tokenFile, "utf8").trim() : process.env.IMAGE_JOB_TOKEN || "";
const confirmation = process.env.MASS_IMAGE_RESUME_CONFIRM || "";
const runId = process.env.IMAGE_JOB_RUN_ID || "mass-image-coverage-phase2-2026-08-29";
const markComplete = process.env.IMAGE_JOB_MARK_COMPLETE !== "false";
const publicationBatchSize = 2;
const publicationConcurrency = 8;

if (
  !jobId ||
  token.length < 43 ||
  !/^mass-image-coverage-phase2-[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(runId) ||
  confirmation !== "RESUME_SAME_PHASE2_JOB"
) {
  throw new Error("Missing protected Phase 2 same-job resume confirmation.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path: string, method = "GET", body?: unknown) {
  let lastStatus = 0;
  const attempts = method === "POST" ? 1 : 4;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/image-jobs/${jobId}/publish${path}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(body ? { "content-type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(60_000),
      });
      lastStatus = response.status;
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
    } catch {
      lastStatus = 0;
    }
    if (attempt + 1 < attempts) await delay(1_000 * (attempt + 1));
  }
  throw new Error(`Protected job request failed: ${lastStatus || "timeout"}`);
}

async function loadPendingCandidateIds() {
  const candidateIds: string[] = [];
  let offset = 0;
  while (true) {
    const response = await request(`?queue=approved&runId=${runId}&offset=${offset}&limit=100`);
    const page = await response.json() as {
      candidates: Array<{ id: string }>;
      hasMore: boolean;
      limit: number;
    };
    candidateIds.push(...page.candidates.map((candidate) => candidate.id));
    if (!page.hasMore || !page.candidates.length) break;
    offset += page.limit;
  }
  return candidateIds;
}

let published = 0;
const initialPending = await loadPendingCandidateIds();
console.log(JSON.stringify({ stage: "resume-phase2", initialPending: initialPending.length }));

for (let pass = 0; pass < 2; pass += 1) {
  const pending = await loadPendingCandidateIds();
  if (!pending.length) break;
  const groupSize = publicationBatchSize * publicationConcurrency;
  for (let index = 0; index < pending.length; index += groupSize) {
    const group = pending.slice(index, index + groupSize);
    const batches = Array.from({ length: Math.ceil(group.length / publicationBatchSize) }, (_, batchIndex) =>
      group.slice(batchIndex * publicationBatchSize, (batchIndex + 1) * publicationBatchSize));
    const results = await Promise.all(batches.map(async (batch) => {
      try {
        const response = await request("", "POST", { candidateIds: batch });
        return await response.json() as { published: number };
      } catch {
        // Reloading the authoritative pending queue on the next pass handles ambiguous timeouts.
        return { published: 0 };
      }
    }));
    published += results.reduce((total, result) => total + result.published, 0);
    console.log(JSON.stringify({
      stage: "resume-phase2",
      pass: pass + 1,
      processed: Math.min(index + group.length, pending.length),
      total: pending.length,
      published,
    }));
    await delay(180);
  }
}

const remaining = await loadPendingCandidateIds();
if (markComplete) await request("", "PATCH", { complete: true });
console.log(JSON.stringify({
  runId,
  mode: "same-job-publication-resume",
  initialPending: initialPending.length,
  published,
  remaining: remaining.length,
  markedComplete: markComplete,
  finishedAt: new Date().toISOString(),
}));
