import type { OrderDraft } from "../../../types/checkout.ts";

export type OrderNotificationStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "unknown";

export type OrderNotificationChannel =
  | "whatsapp_cloud_api"
  | "email_resend";

export type OrderNotificationKind =
  | "new_order"
  | "customer_order_confirmation";

export interface OrderNotification {
  id: string;
  orderId: string;
  kind: OrderNotificationKind;
  channel: OrderNotificationChannel;
  status: OrderNotificationStatus;
  attemptCount: number;
  providerMessageId?: string;
  lastErrorCode?: string;
  lastErrorSummary?: string;
  sentAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ClaimedOrderNotification {
  claimed: boolean;
  notification: OrderNotification;
}

export interface OrderNotificationStore {
  claim(
    tenantId: string,
    orderId: string,
    allowRetry: boolean,
  ): Promise<ClaimedOrderNotification>;
  markSent(
    tenantId: string,
    notificationId: string,
    providerMessageId: string,
  ): Promise<void>;
  markFailed(
    tenantId: string,
    notificationId: string,
    status: "failed" | "unknown",
    errorCode: string,
    errorSummary: string,
  ): Promise<void>;
}

export interface WhatsAppOrderMessage {
  recipient: string;
  templateName: string;
  languageCode: string;
  parameters: readonly string[];
}

export interface WhatsAppOrderProvider {
  send(message: WhatsAppOrderMessage): Promise<{ messageId: string }>;
}

export interface EmailOrderMessage {
  from: string;
  recipient: string;
  subject: string;
  text: string;
  html: string;
  idempotencyKey: string;
}

export interface EmailOrderProvider {
  send(message: EmailOrderMessage): Promise<{ messageId: string }>;
}

export interface NewOrderNotifier {
  notify(order: OrderDraft): Promise<ClaimedOrderNotification>;
  retry(order: OrderDraft): Promise<ClaimedOrderNotification>;
}
