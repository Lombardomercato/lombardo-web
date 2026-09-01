import { createHmac, randomUUID } from "node:crypto";
import { z } from "zod";
import { AiAuditStore } from "@/lib/server/ai/audit-store";
import { readAiSalesConfiguration } from "@/lib/server/ai/config";
import {
  authorizeRuniaCommerceRequest,
  readRuniaCommerceBridgeConfiguration,
  verifyPricingAssertion,
} from "@/lib/server/ai/runia-bridge";
import {
  commerceOperationNameSchema,
  executeCommerceOperation,
} from "@/lib/server/ai/tools";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { readJsonBody } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

const bodySchema = z.object({
  operation: commerceOperationNameSchema,
  input: z.record(z.string(), z.unknown()).default({}),
  pricingAssertion: z.string().min(40).max(2_000).optional(),
  sessionId: z.string().trim().min(8).max(160),
}).strict();

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const [configuration, bridge, fallbackPricing] = await Promise.all([
      Promise.resolve(readAiSalesConfiguration()),
      Promise.resolve(readRuniaCommerceBridgeConfiguration()),
      getCurrentCustomerPricingContext(),
    ]);
    if (!authorizeRuniaCommerceRequest(request, bridge)) {
      return json({ error: "FORBIDDEN", requestId }, 403);
    }
    const body = bodySchema.parse(await readJsonBody(request, 16_384, "RUNIA_BRIDGE_BODY_TOO_LARGE"));
    const pricing = body.pricingAssertion
      ? verifyPricingAssertion(body.pricingAssertion, bridge, fallbackPricing)
      : fallbackPricing;
    if (!pricing.tenantRecordId || pricing.tenantSlug !== "lombardo") {
      throw new Error("RUNIA_BRIDGE_TENANT_INVALID");
    }

    const audit = new AiAuditStore({
      url: configuration.runia.url,
      secretKey: configuration.runia.secretKey,
    });
    const subjectHash = createHmac("sha256", configuration.rateLimitSecret)
      .update(`runia-bridge:${body.sessionId}`)
      .digest("hex");
    const rate = await audit.consumeRateLimit({
      tenantId: pricing.tenantRecordId,
      subjectHash,
      limit: 60,
      windowSeconds: 60,
    });
    if (!rate.allowed) {
      return json({ error: "RATE_LIMITED", requestId }, 429, { "Retry-After": "60" });
    }

    const result = await executeCommerceOperation({
      configuration,
      pricing,
      audit,
      chatId: stableChatId(body.sessionId),
    }, body.operation, body.input);
    await audit.recordEvent({
      chatId: stableChatId(body.sessionId),
      pricing,
      eventName: "tool_call",
      source: "server",
      toolName: body.operation,
      metadata: { transport: "runia_canvas_bridge", requestId },
    }).catch(() => undefined);

    return json({
      ok: true,
      requestId,
      operation: body.operation,
      pricingPolicy: pricing.policy,
      result,
    }, 200);
  } catch (error) {
    console.error("Runia commerce bridge failed", { requestId, code: safeErrorCode(error) });
    const status = error instanceof z.ZodError ? 400 : 503;
    return json({ error: status === 400 ? "INVALID_REQUEST" : "BRIDGE_UNAVAILABLE", requestId }, status);
  }
}

function stableChatId(sessionId: string) {
  const hash = createHmac("sha256", "lombardo-runia-chat-id-v1").update(sessionId).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function safeErrorCode(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase()
    : "UNKNOWN";
}
