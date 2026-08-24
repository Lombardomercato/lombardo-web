import type { OrderDraft } from "../../../types/checkout.ts";

export type OrderNotificationStatus =
  | "pending"
  | "sending"
  | "sent"
  | "failed"
  | "unknown";

export interface OrderNotification {
  id: string;
  orderId: string;
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

export interface NewOrderNotifier {
  notify(order: OrderDraft): Promise<ClaimedOrderNotification>;
  retry(order: OrderDraft): Promise<ClaimedOrderNotification>;
}
