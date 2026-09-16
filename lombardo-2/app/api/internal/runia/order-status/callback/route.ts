import { timingSafeEqual } from "node:crypto";

import { noStoreJson } from "@/lib/server/http-response";
import {
  readRuniaConfiguration,
  readRuniaOrderStatusNotificationConfiguration,
} from "@/lib/server/environment";
import { SupabaseOrderNotificationStore } from "@/lib/server/notifications/supabase-order-notification-store";
import { verifyRuniaOrderStatusCallbackToken } from "@/lib/server/notifications/runia-order-status-auth";

function authorized(
  request: Request,
  callbackSecret: string,
  webhookSecret: string,
  tenantId: string,
  eventId: string,
) {
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  const legacyExpected = Buffer.from(`Bearer ${callbackSecret}`);
  if (
    actual.length === legacyExpected.length
    && timingSafeEqual(actual, legacyExpected)
  ) {
    return true;
  }
  const prefix = "Bearer ";
  const authorization = actual.toString("utf8");
  if (!authorization.startsWith(prefix)) return false;
  return verifyRuniaOrderStatusCallbackToken(
    authorization.slice(prefix.length),
    webhookSecret,
    tenantId,
    eventId,
  );
}

export async function POST(request: Request) {
  const configuration = readRuniaOrderStatusNotificationConfiguration();
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  const result = body?.result;
  if (!/^\d{1,18}$/.test(eventId) || (result !== "sent" && result !== "failed")) {
    return noStoreJson({ ok: false }, { status: 400 });
  }

  const runia = readRuniaConfiguration();
  if (!authorized(
    request,
    configuration.callbackSecret,
    configuration.webhookSecret,
    runia.tenantSlug,
    eventId,
  )) {
    return noStoreJson({ ok: false }, { status: 401 });
  }
  const store = new SupabaseOrderNotificationStore({
    url: runia.url,
    secretKey: runia.secretKey,
  });
  if (result === "sent") {
    const messageId = typeof body?.message_id === "string" ? body.message_id.trim() : "";
    if (!messageId) return noStoreJson({ ok: false }, { status: 400 });
    await store.markSent(runia.tenantSlug, eventId, messageId);
  } else {
    const code = typeof body?.error_code === "string" ? body.error_code : "RUNIA_SEND_FAILED";
    const summary = typeof body?.error_summary === "string" ? body.error_summary : "Runia no pudo enviar la plantilla.";
    await store.markFailed(runia.tenantSlug, eventId, "failed", code, summary);
  }
  return noStoreJson({ ok: true });
}
