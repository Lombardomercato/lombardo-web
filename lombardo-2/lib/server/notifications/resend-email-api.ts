import "server-only";

import type { EmailOrderMessage, EmailOrderProvider } from "./types.ts";
import { OrderNotificationProviderError } from "./provider-error.ts";

interface ResendEmailApiOptions {
  apiKey: string;
  fetcher?: typeof fetch;
}

interface ResendSendResponse {
  id?: string;
  name?: string;
}

export class ResendEmailApi implements EmailOrderProvider {
  private readonly apiKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: ResendEmailApiOptions) {
    this.apiKey = options.apiKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async send(message: EmailOrderMessage) {
    let response: Response;
    try {
      response = await this.fetcher("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": message.idempotencyKey,
        },
        body: JSON.stringify({
          from: message.from,
          to: [message.recipient],
          subject: message.subject,
          text: message.text,
          html: message.html,
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new OrderNotificationProviderError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "No se pudo confirmar si el proveedor recibió el email.",
        "unknown",
      );
    }

    const payload = (await response.json().catch(() => ({}))) as ResendSendResponse;
    if (!response.ok) {
      throw new OrderNotificationProviderError(
        payload.name ? `RESEND_${payload.name.toUpperCase().slice(0, 60)}` : "RESEND_REJECTED",
        "El proveedor rechazó el envío del email operativo.",
        "rejected",
      );
    }
    if (!payload.id) {
      throw new OrderNotificationProviderError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "El proveedor respondió sin un identificador de email.",
        "unknown",
      );
    }
    return { messageId: payload.id };
  }
}
