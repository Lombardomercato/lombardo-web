type DevCommerceEvent =
  | "order.created"
  | "order.reused"
  | "payment.preference_created"
  | "payment.preference_reused"
  | "payment.preference_failed"
  | "webhook.received"
  | "webhook.duplicate"
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
}

type EnvironmentSource = Record<string, string | undefined>;
type LogSink = (message: string) => void;

function safeValue(value: string | boolean | undefined) {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return undefined;
  return value.replace(/[\r\n\t]/g, " ").slice(0, 200);
}

export function logDevCommerce(
  event: DevCommerceEvent,
  fields: DevCommerceFields,
  options: { env?: EnvironmentSource; sink?: LogSink } = {},
) {
  const env = options.env ?? process.env;
  if (env.RUNIA_ENVIRONMENT?.trim().toLowerCase() !== "development") return;

  const payload = Object.fromEntries(
    Object.entries(fields)
      .map(([key, value]) => [key, safeValue(value)])
      .filter((entry): entry is [string, string | boolean] => entry[1] !== undefined),
  );
  const sink = options.sink ?? console.info;
  sink(
    JSON.stringify({
      scope: "lombardo-commerce-dev",
      event,
      ...payload,
    }),
  );
}
