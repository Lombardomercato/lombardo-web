import { createHmac } from "node:crypto";
import { createAgentUIStreamResponse } from "ai";
import { z } from "zod";
import { createLombardoSalesAgent } from "@/lib/server/ai/agent";
import { AiAuditStore } from "@/lib/server/ai/audit-store";
import { readAiSalesConfiguration } from "@/lib/server/ai/config";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { readJsonBody } from "@/lib/server/request-body";
import { classifyTopic } from "@/lib/server/ai/topic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  id: z.string().uuid(),
  messages: z.array(z.unknown()).min(1).max(24),
  trigger: z.string().max(80).optional(),
  messageId: z.string().max(120).optional(),
}).passthrough();

export async function POST(request: Request) {
  let audit: AiAuditStore | null = null;
  let pricing: Awaited<ReturnType<typeof getCurrentCustomerPricingContext>> | null = null;
  let chatId: string | null = null;

  try {
    const configuration = readAiSalesConfiguration();
    const body = bodySchema.parse(await readJsonBody(
      request,
      32_768,
      "El mensaje es demasiado largo.",
    ));
    chatId = body.id;
    const latestUserText = lastUserText(body.messages);
    if (!latestUserText || latestUserText.length > 1_200) {
      return Response.json(
        { error: "Escribí una consulta de hasta 1.200 caracteres." },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    pricing = await getCurrentCustomerPricingContext();
    if (!pricing.tenantRecordId) throw new Error("AI_TENANT_CONTEXT_MISSING");
    audit = new AiAuditStore({
      url: configuration.runia.url,
      secretKey: configuration.runia.secretKey,
    });
    const subjectHash = hashSubject(
      configuration.rateLimitSecret,
      pricing.customerAccountId ?? clientAddress(request),
      "chat",
    );
    const rate = await audit.consumeRateLimit({
      tenantId: pricing.tenantRecordId,
      subjectHash,
      limit: 20,
      windowSeconds: 600,
    });
    if (!rate.allowed) {
      return Response.json(
        { error: "Llegamos al límite momentáneo del asistente. Probá de nuevo en unos minutos." },
        { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "600" } },
      );
    }

    const firstMessage = body.messages.filter(isUserMessage).length === 1;
    if (firstMessage) {
      await audit.recordEvent({
        chatId,
        pricing,
        eventName: "chat_start",
        source: "server",
        topic: classifyTopic(latestUserText),
      }).catch(() => undefined);
    }
    await audit.recordEvent({
      chatId,
      pricing,
      eventName: "chat_message",
      source: "server",
      topic: classifyTopic(latestUserText),
      metadata: { lengthBucket: lengthBucket(latestUserText.length) },
    }).catch(() => undefined);

    const agent = createLombardoSalesAgent({ configuration, pricing, audit, chatId });
    return createAgentUIStreamResponse({
      agent,
      uiMessages: body.messages,
      abortSignal: request.signal,
      timeout: { totalMs: 28_000 },
      sendReasoning: false,
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
      onError: (error) => {
        void audit?.recordEvent({
          chatId: chatId!,
          pricing: pricing!,
          eventName: "chat_error",
          source: "server",
          metadata: { code: safeErrorCode(error) },
        }).catch(() => undefined);
        return "No pude consultar el catálogo ahora. La tienda sigue funcionando; probá de nuevo en un momento.";
      },
    });
  } catch (error) {
    if (audit && pricing && chatId) {
      await audit.recordEvent({
        chatId,
        pricing,
        eventName: "chat_error",
        source: "server",
        metadata: { code: safeErrorCode(error) },
      }).catch(() => undefined);
    }
    return Response.json(
      { error: "El asistente no está disponible ahora. Podés seguir comprando normalmente." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

function lastUserText(messages: unknown[]) {
  const message = [...messages].reverse().find(isUserMessage);
  if (!message) return "";
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .filter((part): part is { type: "text"; text: string } =>
      Boolean(part && typeof part === "object" && Reflect.get(part, "type") === "text" && typeof Reflect.get(part, "text") === "string"),
    )
    .map((part) => part.text)
    .join(" ")
    .trim();
}

function isUserMessage(value: unknown): value is { role: "user"; parts?: unknown[] } {
  return Boolean(value && typeof value === "object" && Reflect.get(value, "role") === "user");
}

function clientAddress(request: Request) {
  return request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unknown";
}

function hashSubject(secret: string, subject: string, namespace: string) {
  return createHmac("sha256", secret).update(`${namespace}:${subject}`).digest("hex");
}

function lengthBucket(length: number) {
  if (length <= 80) return "short";
  if (length <= 300) return "medium";
  return "long";
}

function safeErrorCode(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase()
    : "UNKNOWN";
}
