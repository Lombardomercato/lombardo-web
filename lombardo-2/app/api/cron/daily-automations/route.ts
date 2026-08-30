import { timingSafeEqual } from "node:crypto";
import { createAutomationServices } from "@/lib/server/automations";
import { createCompetitorServices } from "@/lib/server/competitors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  const authorization = request.headers.get("authorization") ?? "";
  if (!secret || secret.length < 16) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(authorization);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function GET(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const results = await createAutomationServices().orchestrator.runDaily("schedule");
  const competitor = await createCompetitorServices().service.run({ trigger: "schedule" });
  const failed = results.some((result) => result.status === "failed" || result.status === "blocked") ||
    competitor.status === "failed" || competitor.status === "blocked";
  return Response.json({ ok: !failed, results, competitor }, { status: failed ? 207 : 200 });
}
