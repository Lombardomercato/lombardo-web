import { createHmac } from "node:crypto";
import { z } from "zod";
import { AiAuditStore } from "@/lib/server/ai/audit-store";
import { readAiSalesConfiguration } from "@/lib/server/ai/config";
import { AI_EVENT_NAMES } from "@/lib/server/ai/types";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { readJsonBody } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";

const browserEvents = AI_EVENT_NAMES.filter((name) => !["tool_call", "tool_error", "chat_error", "chat_message", "chat_start"].includes(name));
const bodySchema = z.object({
  chatId: z.string().uuid(),
  eventName: z.enum(browserEvents as [typeof browserEvents[number], ...typeof browserEvents]),
  productId: z.string().uuid().optional(),
  metadata: z.record(z.string().max(40), z.union([z.string().max(160), z.number(), z.boolean(), z.null()])).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await readJsonBody(request, 4_096, "El evento es demasiado grande."));
    const [configuration, pricing] = await Promise.all([
      Promise.resolve(readAiSalesConfiguration()),
      getCurrentCustomerPricingContext(),
    ]);
    const audit = new AiAuditStore({
      url: configuration.runia.url,
      secretKey: configuration.runia.secretKey,
    });
    if (!pricing.tenantRecordId) throw new Error("AI_TENANT_CONTEXT_MISSING");
    const address = request.headers.get("x-real-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || "unknown";
    const subjectHash = createHmac("sha256", configuration.rateLimitSecret)
      .update(`event:${pricing.customerAccountId ?? address.trim()}`)
      .digest("hex");
    const rate = await audit.consumeRateLimit({
      tenantId: pricing.tenantRecordId,
      subjectHash,
      limit: 120,
      windowSeconds: 600,
    });
    if (!rate.allowed) return new Response(null, { status: 429 });
    await audit.recordEvent({
      chatId: input.chatId,
      pricing,
      eventName: input.eventName,
      source: "storefront",
      productId: input.productId,
      metadata: input.metadata,
    });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response(null, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
