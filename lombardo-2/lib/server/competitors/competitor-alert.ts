import "server-only";

import {
  emailOrderNotificationsEnabled,
  readEmailOrderNotificationConfiguration,
} from "@/lib/server/environment";
import type { PendingCompetitorAlert } from "./competitor-store";

const ALERT_LABELS = {
  lombardo_more_expensive: "Lombardo está > umbral más caro",
  competitor_price_change: "Cambio fuerte de precio competidor",
  match_lost: "Producto perdió su match",
} as const;

export interface CompetitorAlertDelivery {
  status: "sent" | "suppressed";
  messageId?: string;
}

export class ResendCompetitorAlert {
  private readonly fetcher: typeof fetch;

  constructor(fetcher: typeof fetch = fetch) {
    this.fetcher = fetcher;
  }

  private async send(input: {
    runId: string;
    subject: string;
    body: string;
    suffix: string;
  }): Promise<CompetitorAlertDelivery> {
    if (!emailOrderNotificationsEnabled()) return { status: "suppressed" };
    const configuration = readEmailOrderNotificationConfiguration();
    const response = await this.fetcher("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${configuration.apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `lombardo-competencia-${input.runId}-${input.suffix}`,
      },
      body: JSON.stringify({
        from: configuration.sender,
        to: [configuration.recipient],
        subject: input.subject,
        text: `${input.body}\n\nRevisar: ${configuration.adminUrl}/competencia`,
      }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    const payload = (await response.json().catch(() => ({}))) as { id?: string };
    if (!response.ok || !payload.id) throw new Error("Resend no confirmó la alerta de Competencia.");
    return { status: "sent", messageId: payload.id };
  }

  async sendEvents(runId: string, events: PendingCompetitorAlert[]) {
    const selected = events.slice(0, 25);
    const lines = selected.map((event, index) => {
      const name = typeof event.payload.externalName === "string" ? event.payload.externalName : "Producto";
      const difference = event.differencePct === undefined ? "" : ` · ${event.differencePct.toFixed(2)}%`;
      return `${index + 1}. ${ALERT_LABELS[event.type]}${difference} · ${name}`;
    });
    return this.send({
      runId,
      subject: `[LOMBARDO] Competencia: ${events.length} evento(s) importante(s)`,
      body: [
        "Competitor Intelligence detectó señales que requieren decisión humana.",
        ...lines,
        ...(events.length > selected.length ? [`+ ${events.length - selected.length} evento(s) adicionales en Admin.`] : []),
        "No se modificó ningún precio de Lombardo.",
      ].join("\n\n"),
      suffix: "events",
    });
  }

  async sendCircuitBreaker(runId: string, message: string) {
    return this.send({
      runId,
      subject: "[LOMBARDO] Competencia: circuit breaker abierto",
      body: [
        "La ingesta de Positano se detuvo antes de guardar datos.",
        message.slice(0, 500),
        "Se preservó el último snapshot estable y no se modificó ningún precio de Lombardo.",
      ].join("\n\n"),
      suffix: "circuit",
    });
  }
}
