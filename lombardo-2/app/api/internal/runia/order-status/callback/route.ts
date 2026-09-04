import { timingSafeEqual } from "node:crypto";

import { noStoreJson } from "@/lib/server/http-response";
import {
  readRuniaConfiguration,
  readRuniaOrderStatusNotificationConfiguration,
} from "@/lib/server/environment";
import { SupabaseOrderNotificationStore } from "@/lib/server/notifications/supabase-order-notification-store";

function authorized(request: Request, secret: string) {
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(request.headers.get("authorization") ?? "");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function POST(request: Request) {
  const configuration = readRuniaOrderStatusNotificationConfiguration();
  if (!authorized(request, configuration.callbackSecret)) {
    return noStoreJson({ ok: false }, { status: 401 });
  }
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const eventId = typeof body?.event_id === "string" ? body.event_id : "";
  const result = body?.result;
  if (!/^\d{1,18}$/.test(eventId) || (result !== "sent" && result !== "failed")) {
    return noStoreJson({ ok: false }, { status: 400 });
  }

  const runia = readRuniaConfiguration();
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
