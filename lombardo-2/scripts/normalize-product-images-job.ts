import { readFileSync } from "node:fs";

const baseUrl = (process.env.IMAGE_JOB_BASE_URL || "https://www.lombardomercato.com").replace(/\/$/, "");
const jobId = process.env.IMAGE_JOB_ID || "";
const tokenFile = process.env.IMAGE_JOB_TOKEN_FILE || "";
const token = tokenFile ? readFileSync(tokenFile, "utf8").trim() : "";
const confirmation = process.env.IMAGE_NORMALIZE_CONFIRM || "";

if (!jobId || token.length < 43 || confirmation !== "NORMALIZE_APPROVED_SAFE_IMAGES") {
  throw new Error("Missing protected product-image normalization confirmation.");
}

const delay = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function request(path: string, body: unknown) {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/admin/image-jobs/${jobId}/${path}`, {
        method: path === "normalize" ? "POST" : "PATCH",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(65_000),
      });
      lastStatus = response.status;
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429) {
        throw new Error(`Protected normalization rejected: ${response.status}`);
      }
    } catch (error) {
      if (attempt === 3) throw error;
    }
    await delay(1_000 * (attempt + 1));
  }
  throw new Error(`Protected normalization failed: ${lastStatus || "timeout"}`);
}

let cursor: string | null = null;
let processed = 0;
let published = 0;
let needsReview = 0;
let failed = 0;
let complete = false;
while (!complete) {
  const response = await request("normalize", { cursor, limit: 12 });
  const result = await response.json() as {
    processed: number;
    published: number;
    needsReview: number;
    failed: number;
    cursor: string | null;
    complete: boolean;
  };
  processed += result.processed;
  published += result.published;
  needsReview += result.needsReview;
  failed += result.failed;
  cursor = result.cursor;
  complete = result.complete;
  if (processed % 60 === 0 || complete) {
    console.log(JSON.stringify({ stage: "normalize", processed, published, needsReview, failed, complete }));
  }
  await delay(150);
}

await request("publish", { complete: true });
console.log(JSON.stringify({ stage: "normalize-complete", processed, published, needsReview, failed }));
