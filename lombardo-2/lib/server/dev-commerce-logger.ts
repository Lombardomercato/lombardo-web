import { randomUUID } from "node:crypto";

type DevCommerceEvent =
  | "catalog.request_failed"
  | "order.created"
  | "order.reused"
  | "order.request_failed"
  | "order_notification.sent"
  | "order_notification.failed"
  | "order_notification.persistence_failed"
  | "payment.preference_created"
  | "payment.preference_reused"
  | "payment.preference_failed"
  | "payment.whatsapp_coordination_selected"
  | "whatsapp.coordination_failed"
  | "webhook.received"
  | "webhook.signature_rejected"
  | "webhook.duplicate"
  | "webhook.failed"
  | "payment.transition";

interface DevCommerceFields {
  orderId?: string;
  publicId?: string;
  preferenceId?: string;
  paymentId?: string;
  webhookEventId?: string;
  fromPaymentStatus?: string;
  toPaymentStatus?: string;
  fromOrderStatus?: string;
  toOrderStatus?: string;
  reused?: boolean;
  duplicate?: boolean;
  reason?: string;
  requestId?: string;
  route?: string;
  errorName?: string;
  errorMessage?: string;
  status?: number;
  notificationId?: string;
  providerMessageId?: string;
  errorCode?: string;
  notificationStatus?: string;
  notificationKind?: string;
}

type EnvironmentSource = Record<string, string | undefined>;
type LogSink = (message: string) => void;

function safeValue(value: string | boolean | number | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\t]/g, " ").slice(0, 200);
}

export function logDevCommerce(
  event: DevCommerceEvent,
  fields: DevCommerceFields,
  options: { env?: EnvironmentSource; sink?: LogSink } = {},
) {
  const env = options.env ?? process.env;
  const environment =
    env.VERCEL_ENV?.trim().toLowerCase() ??
    env.RUNIA_ENVIRONMENT?.trim().toLowerCase();
  if (!environment && !options.sink) return;
  const payload = Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, safeValue(value)])
      .filter(
        (entry): entry is [string, string | boolean | number] =>
          entry[1] !== undefined,
      ),
  );
  const sink = options.sink ?? console.info;
  sink(
    JSON.stringify({
      scope: "lombardo-commerce",
      environment: environment ?? "unknown",
      event,
      ...payload,
    }),
  );
}

export function getRequestId(request: Request) {
  const provided =
    request.headers.get("x-vercel-id") ?? request.headers.get("x-request-id");
  const sanitized = safeValue(provided ?? undefined);
  return typeof sanitized === "string" && sanitized ? sanitized : randomUUID();
}

export function logCommerceError(
  event: Extract<
    DevCommerceEvent,
    | "catalog.request_failed"
    | "order.request_failed"
    | "whatsapp.coordination_failed"
    | "webhook.failed"
  >,
  error: unknown,
  fields: Pick<DevCommerceFields, "requestId" | "route">,
) {
  const knownError = error instanceof Error ? error : null;
  logDevCommerce(event, {
    ...fields,
    errorName: knownError?.name ?? "UnknownError",
    errorMessage: knownError?.message ?? "Unknown server error",
    status:
      knownError && "status" in knownError && typeof knownError.status === "number"
        ? knownError.status
        : 500,
  });
}
