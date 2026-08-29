import "server-only";

import { AUTOMATION_TYPES, type AutomationDashboard, type AutomationType } from "@/lib/automations/types";
import { nextDailyRun } from "@/lib/automations/date";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { createAutomationServices } from ".";

const LABELS: Record<AutomationType, string> = {
  vinros: "VINROS",
  daily_cava: "CAVA DIARIA",
  daily_featured: "HOME DESTACADOS",
  live_guides: "GUÍAS DINÁMICAS",
  seo_content: "SEO CONTENT",
};

function resultText(summary: Record<string, unknown>) {
  const visible = Object.entries(summary)
    .filter(([, value]) => ["string", "number", "boolean"].includes(typeof value))
    .slice(0, 4)
    .map(([key, value]) => `${key}: ${String(value)}`);
  return visible.join(" · ") || "Sin resultado todavía";
}

export async function loadAutomationDashboard(): Promise<AutomationDashboard> {
  await requireAdminSession();
  const { store } = createAutomationServices();
  const [latest, pins] = await Promise.all([store.latestRuns(), store.listPins()]);
  const nextRunAt = nextDailyRun();
  return {
    rows: AUTOMATION_TYPES.map((type) => {
      const run = latest.get(type);
      return {
        type,
        label: LABELS[type],
        status: run?.status ?? "never",
        lastRunAt: run?.finishedAt ?? run?.startedAt,
        nextRunAt,
        result: run ? resultText(run.summary) : "Todavía no se ejecutó desde el orquestador.",
        errors: run?.errors ?? [],
      };
    }),
    pins,
  };
}
