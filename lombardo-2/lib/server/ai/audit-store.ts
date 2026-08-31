import "server-only";

import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { AiEventName } from "./types";

interface AuditStoreOptions {
  url: string;
  secretKey: string;
  fetcher?: typeof fetch;
}

interface EventInput {
  chatId: string;
  pricing: CustomerPricingContext;
  eventName: AiEventName;
  source?: "storefront" | "server" | "admin";
  toolName?: string;
  productId?: string;
  topic?: string;
  metadata?: Record<string, string | number | boolean | null>;
}

export class AiAuditStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;

  constructor(options: AuditStoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.fetcher = options.fetcher ?? fetch;
  }

  async consumeRateLimit(input: {
    tenantId: string;
    subjectHash: string;
    limit?: number;
    windowSeconds?: number;
  }) {
    const result = await this.rpc<{
      allowed: boolean;
      count: number;
      limit: number;
      resetAt: string;
    }>("lombardo_ai_consume_rate_limit", {
      p_tenant_id: input.tenantId,
      p_subject_hash: input.subjectHash,
      p_limit: input.limit ?? 20,
      p_window_seconds: input.windowSeconds ?? 600,
    });
    return result;
  }

  async recordEvent(input: EventInput) {
    return this.rpc<number>("lombardo_ai_record_event", {
      p_tenant_id: input.pricing.tenantRecordId,
      p_chat_session_id: input.chatId,
      p_customer_account_id: input.pricing.customerAccountId ?? null,
      p_pricing_policy: input.pricing.policy,
      p_event_name: input.eventName,
      p_source: input.source ?? "server",
      p_tool_name: input.toolName ?? null,
      p_product_id: input.productId ?? null,
      p_topic: input.topic?.slice(0, 60) ?? null,
      p_metadata: sanitizeMetadata(input.metadata),
    });
  }

  async dashboard(tenantId: string, days = 14) {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const params = new URLSearchParams({
      select: "chat_session_id,event_name,tool_name,product_id,created_at",
      tenant_id: `eq.${tenantId}`,
      created_at: `gte.${since}`,
      order: "created_at.desc",
      limit: "5000",
    });
    const response = await this.request(`lombardo_ai_events?${params}`);
    if (!response.ok) throw new Error("AI_AUDIT_DASHBOARD_UNAVAILABLE");
    const events = (await response.json()) as Array<{
      chat_session_id: string;
      event_name: AiEventName;
      tool_name: string | null;
      product_id: string | null;
      created_at: string;
    }>;
    return summarizeDashboard(events, days);
  }

  private async rpc<T>(name: string, body: Record<string, unknown>) {
    const response = await this.request(`rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`AI_AUDIT_RPC_${response.status}`);
    return (await response.json()) as T;
  }

  private request(path: string, init: RequestInit = {}) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...headers, ...init.headers },
      cache: "no-store",
    });
  }
}

function sanitizeMetadata(metadata?: EventInput["metadata"]) {
  if (!metadata) return {};
  return Object.fromEntries(
    Object.entries(metadata)
      .slice(0, 12)
      .map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 160) : value]),
  );
}

function summarizeDashboard(
  events: Array<{ chat_session_id: string; event_name: AiEventName; tool_name: string | null; product_id: string | null; created_at: string }>,
  days: number,
) {
  const count = (name: AiEventName) => events.filter((event) => event.event_name === name).length;
  const sessions = new Set(
    events.filter((event) => event.event_name === "chat_start").map((event) => event.chat_session_id),
  ).size;
  const recommendations = count("recommendation_shown");
  const clicks = count("recommendation_click");
  const adds = count("chat_add_to_cart");
  const tools = new Map<string, number>();
  for (const event of events) {
    if (event.tool_name) tools.set(event.tool_name, (tools.get(event.tool_name) ?? 0) + 1);
  }
  return {
    days,
    sessions,
    messages: count("chat_message"),
    toolCalls: count("tool_call"),
    recommendations,
    clicks,
    adds,
    errors: count("chat_error") + count("tool_error"),
    clickRate: recommendations ? Math.round((clicks / recommendations) * 100) : 0,
    addRate: recommendations ? Math.round((adds / recommendations) * 100) : 0,
    topTools: [...tools.entries()].sort((left, right) => right[1] - left[1]).slice(0, 5),
  };
}
