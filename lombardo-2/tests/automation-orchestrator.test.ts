import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { AutomationAlertPort } from "../lib/server/automations/automation-alert.ts";
import {
  AutomationOrchestrator,
  type AutomationRunStore,
  type AutomationTask,
} from "../lib/server/automations/orchestrator.ts";
import type { AutomationStatus, AutomationType } from "../lib/automations/types.ts";

class MemoryStore implements AutomationRunStore {
  readonly rows = new Map<string, { id: string; status: AutomationStatus; attempts: number }>();
  readonly finished: Array<{ runId: string; status: string; alertRequired?: boolean }> = [];
  alerts: Array<{ runId: string; status: string }> = [];

  async claim(input: { type: AutomationType; runKey: string }) {
    const key = `${input.type}:${input.runKey}`;
    const existing = this.rows.get(key);
    if (existing?.status === "running") return { claimed: false, reason: "already_running", runId: existing.id };
    if (existing && ["completed", "warning", "skipped"].includes(existing.status)) {
      return { claimed: false, reason: "already_finished", runId: existing.id };
    }
    const row = existing ?? { id: `run-${this.rows.size + 1}`, status: "running" as const, attempts: 0 };
    row.status = "running";
    row.attempts += 1;
    this.rows.set(key, row);
    return { claimed: true, runId: row.id, attempt: row.attempts };
  }

  async finishRun(input: {
    runId: string;
    status: Exclude<AutomationStatus, "running">;
    alertRequired?: boolean;
  }) {
    const row = [...this.rows.values()].find((candidate) => candidate.id === input.runId);
    assert.ok(row);
    row.status = input.status;
    this.finished.push(input);
  }

  async recordAlert(runId: string, input: { status: "sent" | "failed" }) {
    this.alerts.push({ runId, status: input.status });
  }
}

class MemoryAlerter implements AutomationAlertPort {
  sent: AutomationType[] = [];
  async send(input: { run: { id: string; type: AutomationType } }) {
    this.sent.push(input.run.type);
    return { messageId: `message-${this.sent.length}` };
  }
}

function tasks(overrides: Partial<Record<AutomationType, AutomationTask>> = {}) {
  const normal: AutomationTask = async () => ({ status: "completed", summary: { ok: true } });
  return {
    vinros: normal,
    daily_cava: normal,
    daily_featured: normal,
    live_guides: normal,
    seo_content: normal,
    ...overrides,
  };
}

const fixedNow = () => new Date("2026-08-29T03:05:00.000Z");

test("día normal ejecuta las cinco tareas una sola vez y no envía email", async () => {
  const store = new MemoryStore();
  const alerts = new MemoryAlerter();
  const orchestrator = new AutomationOrchestrator(store, tasks(), alerts, fixedNow);
  const results = await orchestrator.runDaily();
  assert.equal(results.length, 5);
  assert.ok(results.every((result) => result.status === "completed"));
  assert.equal(alerts.sent.length, 0);
});

test("fuente caída falla cerrado, conserva fallback estable y alerta", async () => {
  const store = new MemoryStore();
  const alerts = new MemoryAlerter();
  const orchestrator = new AutomationOrchestrator(store, tasks({
    daily_featured: async () => { throw new Error("SOURCE_UNAVAILABLE"); },
  }), alerts, fixedNow);
  const result = await orchestrator.run({ type: "daily_featured", trigger: "schedule" });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.summary, { retainedStableFallback: true });
  assert.deepEqual(alerts.sent, ["daily_featured"]);
});

test("Cava fallida queda auditada como error y alerta sin clonar el desafío anterior", async () => {
  const store = new MemoryStore();
  const alerts = new MemoryAlerter();
  const orchestrator = new AutomationOrchestrator(store, tasks({
    daily_cava: async () => { throw new Error("CHALLENGE_GENERATION_FAILED"); },
  }), alerts, fixedNow);
  const result = await orchestrator.run({ type: "daily_cava", trigger: "schedule" });
  assert.equal(result.status, "failed");
  assert.deepEqual(result.summary, { retainedStableFallback: false });
  assert.deepEqual(alerts.sent, ["daily_cava"]);
});

test("destacados sin candidatos conservan la selección estable", async () => {
  const store = new MemoryStore();
  const orchestrator = new AutomationOrchestrator(store, tasks({
    daily_featured: async () => ({
      status: "warning",
      summary: { selected: 0, retainedStableFallback: true },
      warnings: ["Sin candidatos"],
    }),
  }), new MemoryAlerter(), fixedNow);
  const result = await orchestrator.run({ type: "daily_featured", trigger: "schedule" });
  assert.equal(result.status, "warning");
  assert.equal(result.summary.retainedStableFallback, true);
});

test("doble scheduler no duplica una ejecución", async () => {
  const store = new MemoryStore();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const orchestrator = new AutomationOrchestrator(store, tasks({
    daily_featured: async () => {
      await gate;
      return { status: "completed", summary: {} };
    },
  }), new MemoryAlerter(), fixedNow);
  const first = orchestrator.run({ type: "daily_featured", trigger: "schedule" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const duplicate = await orchestrator.run({ type: "daily_featured", trigger: "schedule" });
  assert.equal(duplicate.claimed, false);
  assert.equal(duplicate.reason, "already_running");
  release();
  assert.equal((await first).status, "completed");
});

test("retry reutiliza el run lógico fallido y luego queda idempotente", async () => {
  const store = new MemoryStore();
  let attempt = 0;
  const orchestrator = new AutomationOrchestrator(store, tasks({
    live_guides: async () => {
      attempt += 1;
      if (attempt === 1) throw new Error("TEMPORARY_SOURCE_FAILURE");
      return { status: "completed", summary: { retry: true } };
    },
  }), new MemoryAlerter(), fixedNow);
  const first = await orchestrator.run({ type: "live_guides", trigger: "schedule", runKey: "daily:2026-08-29" });
  const retry = await orchestrator.run({ type: "live_guides", trigger: "retry", runKey: "daily:2026-08-29" });
  const duplicate = await orchestrator.run({ type: "live_guides", trigger: "retry", runKey: "daily:2026-08-29" });
  assert.equal(first.status, "failed");
  assert.equal(retry.status, "completed");
  assert.equal(duplicate.claimed, false);
  assert.equal(attempt, 2);
});

test("schema fuerza RLS, locks, SAFE y pipeline sin autopublicación", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260829223000_automation_orchestrator.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "automation_runs",
    "home_feature_pins",
    "home_daily_slots",
    "automation_content_entries",
    "automation_content_product_slots",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
  }
  assert.match(migration, /pg_advisory_xact_lock/i);
  assert.match(migration, /AUTOMATION_PRODUCT_NOT_SAFE/i);
  assert.match(migration, /product\.eligibility_status = 'safe'/i);
  assert.match(migration, /OPPORTUNITY[\s\S]*DRAFT[\s\S]*QA[\s\S]*APPROVED[\s\S]*PUBLISHED/i);
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)[^;]*to\s+(anon|authenticated)/i);
});

test("scheduler corre una vez a las 00:05 ART y exige CRON_SECRET", async () => {
  const [vercel, route] = await Promise.all([
    readFile(new URL("../vercel.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/cron/daily-automations/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(vercel, /"schedule": "5 3 \* \* \*"/);
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /timingSafeEqual/);
  assert.doesNotMatch(route, /MERCADO_PAGO|VINROS.*write/i);
});

test("historial de destacados compone ambos límites sobre selection_date", async () => {
  const store = await readFile(
    new URL("../lib/server/automations/automation-store.ts", import.meta.url),
    "utf8",
  );
  assert.match(store, /search\.append\("selection_date", `gte\./);
  assert.match(store, /search\.append\("selection_date", `lt\./);
  assert.doesNotMatch(store, /"selection_date\.lt"/);
});

test("guardas SAFE privadas sólo son ejecutables por service_role", async () => {
  const permissions = await readFile(
    new URL("../supabase/migrations/20260829224500_automation_private_permissions.sql", import.meta.url),
    "utf8",
  );
  assert.match(permissions, /grant usage on schema lombardo_private to service_role/i);
  assert.match(permissions, /grant execute on function lombardo_private\.assert_safe_automation_product[\s\S]*to service_role/i);
  assert.doesNotMatch(permissions, /grant[^;]*to\s+(anon|authenticated)/i);
});
