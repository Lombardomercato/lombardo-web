import "server-only";

import { emailOrderNotificationsEnabled, readEmailOrderNotificationConfiguration } from "@/lib/server/environment";
import type { AutomationRun, AutomationStatus, AutomationType } from "@/lib/automations/types";

export interface AutomationAlertPort {
  send(input: {
    run: Pick<AutomationRun, "id" | "type">;
    status: AutomationStatus;
    summary: Record<string, unknown>;
    errors: string[];
  }): Promise<{ messageId: string }>;
}

const TYPE_LABELS: Record<AutomationType, string> = {
  vinros: "VINROS",
  daily_cava: "Cava diaria",
  daily_featured: "Destacados de Home",
  live_guides: "Guías dinámicas",
  seo_content: "SEO content",
};

export class ResendAutomationAlert implements AutomationAlertPort {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  async send(input: {
    run: Pick<AutomationRun, "id" | "type">;
    status: AutomationStatus;
    summary: Record<string, unknown>;
    errors: string[];
  }) {
    if (!emailOrderNotificationsEnabled()) {
      throw new Error("Las alertas operativas por email no están habilitadas.");
    }
    const configuration = readEmailOrderNotificationConfiguration();
    const label = TYPE_LABELS[input.run.type];
    const safeSummary = JSON.stringify(input.summary, null, 2).slice(0, 4_000);
    const safeErrors = input.errors.map((error) => error.slice(0, 240)).join("\n") || "Sin detalle adicional.";
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lombardo-automation-${input.run.id}`,
      },
      body: JSON.stringify({
        from: configuration.sender,
        to: [configuration.recipient],
        subject: `[LOMBARDO] ${label}: ${input.status.toLocaleUpperCase("es-AR")}`,
        text: [
          `${label} requiere atención.`,
          `Estado: ${input.status}`,
          `Ejecución: ${input.run.id}`,
          `Detalle: ${safeErrors}`,
          `Resumen: ${safeSummary}`,
          `Revisar: ${configuration.adminUrl}/automatizaciones`,
        ].join("\n\n"),
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    if (!response.ok || !payload.id) throw new Error("Resend no confirmó la alerta operativa.");
    return { messageId: payload.id };
  }
}
