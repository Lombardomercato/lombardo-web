import "server-only";

import type {
  WhatsAppOrderMessage,
  WhatsAppOrderProvider,
} from "./types.ts";
import { OrderNotificationProviderError } from "./provider-error.ts";

interface WhatsAppCloudApiOptions {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
  fetcher?: typeof fetch;
}

interface WhatsAppSendResponse {
  messages?: Array<{ id?: string }>;
  error?: { code?: number; error_subcode?: number };
}

export class WhatsAppProviderError extends OrderNotificationProviderError {}

export class WhatsAppCloudApi implements WhatsAppOrderProvider {
  private readonly endpoint: string;
  private readonly accessToken: string;
  private readonly fetcher: typeof fetch;

  constructor(options: WhatsAppCloudApiOptions) {
    this.endpoint = `https://graph.facebook.com/${options.graphApiVersion}/${options.phoneNumberId}/messages`;
    this.accessToken = options.accessToken;
    this.fetcher = options.fetcher ?? fetch;
  }

  async send(message: WhatsAppOrderMessage) {
    let response: Response;
    try {
      response = await this.fetcher(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: message.recipient,
          type: "template",
          template: {
            name: message.templateName,
            language: { code: message.languageCode },
            components: [
              {
                type: "body",
                parameters: message.parameters.map((text) => ({
                  type: "text",
                  text,
                })),
              },
            ],
          },
        }),
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch {
      throw new WhatsAppProviderError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "No se pudo confirmar si Meta recibió el mensaje.",
        "unknown",
      );
    }

    const payload = (await response.json().catch(() => ({}))) as WhatsAppSendResponse;
    if (!response.ok) {
      const providerCode = payload.error?.code;
      const providerSubcode = payload.error?.error_subcode;
      throw new WhatsAppProviderError(
        providerCode ? `META_${providerCode}${providerSubcode ? `_${providerSubcode}` : ""}` : "META_REJECTED",
        "Meta rechazó el envío de la notificación.",
        "rejected",
      );
    }

    const messageId = payload.messages?.[0]?.id;
    if (!messageId) {
      throw new WhatsAppProviderError(
        "PROVIDER_OUTCOME_UNKNOWN",
        "Meta respondió sin un identificador de mensaje.",
        "unknown",
      );
    }
    return { messageId };
  }
}
