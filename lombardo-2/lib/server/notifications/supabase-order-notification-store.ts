import "server-only";

import { ServerOrderError } from "../orders/server-order-error.ts";
import type {
  ClaimedOrderNotification,
  OrderNotificationChannel,
  OrderNotification,
  OrderNotificationStatus,
  OrderNotificationStore,
} from "./types.ts";

interface SupabaseOrderNotificationStoreOptions {
  url: string;
  secretKey: string;
  channel?: OrderNotificationChannel;
  fetcher?: typeof fetch;
}

interface NotificationRow {
  id: string | number;
  order_id: string | number;
  channel: OrderNotificationChannel;
  status: OrderNotificationStatus;
  attempt_count: number;
  provider_message_id: string | null;
  last_error_code: string | null;
  last_error_summary: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface ClaimRow {
  claimed: boolean;
  notification_record: NotificationRow;
}

function mapNotification(row: NotificationRow): OrderNotification {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    channel: row.channel,
    status: row.status,
    attemptCount: Number(row.attempt_count),
    providerMessageId: row.provider_message_id ?? undefined,
    lastErrorCode: row.last_error_code ?? undefined,
    lastErrorSummary: row.last_error_summary ?? undefined,
    sentAt: row.sent_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class SupabaseOrderNotificationStore implements OrderNotificationStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly fetcher: typeof fetch;
  private readonly channel: OrderNotificationChannel;

  constructor(options: SupabaseOrderNotificationStoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.fetcher = options.fetcher ?? fetch;
    this.channel = options.channel ?? "whatsapp_cloud_api";
  }

  private headers(prefer?: string) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      "Content-Type": "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  private async request(path: string, init: RequestInit = {}, prefer?: string) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.headers(prefer), ...init.headers },
      cache: "no-store",
    });
  }

  private failure(message: string): never {
    throw new ServerOrderError("CREATE_FAILED", message, { status: 502 });
  }

  async claim(
    tenantId: string,
    orderId: string,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification> {
    const response = await this.request("rpc/lombardo_claim_order_notification_v2", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: tenantId,
        p_order_id: Number(orderId),
        p_allow_retry: allowRetry,
        p_channel: this.channel,
      }),
    });
    if (!response.ok) this.failure("No pudimos reservar la notificación operativa.");
    const rows = (await response.json()) as ClaimRow[];
    const row = rows[0];
    if (!row?.notification_record) {
      this.failure("Runia no devolvió la notificación operativa.");
    }
    return {
      claimed: row.claimed,
      notification: mapNotification(row.notification_record),
    };
  }

  private async update(
    tenantId: string,
    notificationId: string,
    body: Record<string, unknown>,
  ) {
    const search = new URLSearchParams({
      tenant_id: `eq.${tenantId}`,
      id: `eq.${notificationId}`,
      status: "eq.sending",
    });
    const response = await this.request(
      `commerce_order_notifications?${search}`,
      { method: "PATCH", body: JSON.stringify(body) },
      "return=minimal",
    );
    if (!response.ok) this.failure("No pudimos actualizar la notificación operativa.");
  }

  async markSent(
    tenantId: string,
    notificationId: string,
    providerMessageId: string,
  ) {
    await this.update(tenantId, notificationId, {
      status: "sent",
      provider_message_id: providerMessageId,
      sent_at: new Date().toISOString(),
    });
  }

  async markFailed(
    tenantId: string,
    notificationId: string,
    status: "failed" | "unknown",
    errorCode: string,
    errorSummary: string,
  ) {
    await this.update(tenantId, notificationId, {
      status,
      last_error_code: errorCode.slice(0, 80),
      last_error_summary: errorSummary.slice(0, 240),
    });
  }
}
