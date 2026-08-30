export {};

const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "https://www.lombardomercato.com").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const token = process.env.IMAGE_JOB_TOKEN || "";
const confirmation = process.env.MASS_IMAGE_RESUME_CONFIRM || "";
const runId = "mass-image-coverage-phase2-2026-08-29";

if (!jobId || token.length < 43 || confirmation !== "RESUME_SAME_PHASE2_JOB") {
  throw new Error("Missing protected Phase 2 same-job resume confirmation.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path: string, method = "GET", body?: unknown) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
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
    await delay(1_000 * (attempt + 1));
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
  for (let index = 0; index < pending.length; index += 5) {
    const batch = pending.slice(index, index + 5);
    try {
      const response = await request("", "POST", { candidateIds: batch });
      const result = await response.json() as { published: number };
      published += result.published;
    } catch {
      // Reloading the authoritative pending queue on the next pass handles ambiguous timeouts.
    }
    if ((index + batch.length) % 50 === 0 || index + batch.length === pending.length) {
      console.log(JSON.stringify({
        stage: "resume-phase2",
        pass: pass + 1,
        processed: index + batch.length,
        total: pending.length,
        published,
      }));
    }
    await delay(180);
  }
}

const remaining = await loadPendingCandidateIds();
await request("", "PATCH", { complete: true });
console.log(JSON.stringify({
  runId,
  mode: "same-job-publication-resume",
  initialPending: initialPending.length,
  published,
  remaining: remaining.length,
  finishedAt: new Date().toISOString(),
}));
