import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookSignatureInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}

export type WebhookSignatureFailureReason =
  | "missing_signature_header"
  | "missing_secret"
  | "malformed_signature_header"
  | "invalid_signature_hash"
  | "invalid_timestamp"
  | "timestamp_out_of_tolerance"
  | "signature_mismatch";

export type WebhookSignatureVerification =
  | { valid: true }
  | { valid: false; reason: WebhookSignatureFailureReason };

function parseSignature(value: string | null) {
  if (!value) return null;
  const fields = new Map(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key.trim().toLowerCase(), rest.join("=").trim()];
    }),
  );
  const timestamp = fields.get("ts");
  const signature = fields.get("v1");
  return timestamp && signature ? { timestamp, signature } : null;
}

function signatureManifest(
  dataId: string | null,
  requestId: string | null,
  timestamp: string,
) {
  const normalizedDataId = dataId?.trim();
  const normalizedRequestId = requestId?.trim();
  return [
    normalizedDataId ? `id:${normalizedDataId};` : "",
    normalizedRequestId ? `request-id:${normalizedRequestId};` : "",
    `ts:${timestamp};`,
  ].join("");
}

export function inspectMercadoPagoWebhookSignature(
  input: WebhookSignatureInput,
): WebhookSignatureVerification {
  if (!input.xSignature?.trim()) {
    return { valid: false, reason: "missing_signature_header" };
  }
  if (!input.secret) {
    return { valid: false, reason: "missing_secret" };
  }
  const parsed = parseSignature(input.xSignature);
  if (!parsed) {
    return { valid: false, reason: "malformed_signature_header" };
  }
  if (!/^[a-f0-9]{64}$/i.test(parsed.signature)) {
    return { valid: false, reason: "invalid_signature_hash" };
  }

  if (!/^\d+$/.test(parsed.timestamp)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  const rawTimestamp = Number(parsed.timestamp);
  if (!Number.isFinite(rawTimestamp)) {
    return { valid: false, reason: "invalid_timestamp" };
  }
  const timestampMs = parsed.timestamp.length <= 10
    ? rawTimestamp * 1000
    : rawTimestamp;
  const now = input.now ?? Date.now();
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs(now - timestampMs) > toleranceMs) {
    return { valid: false, reason: "timestamp_out_of_tolerance" };
  }

  const expected = createHmac("sha256", input.secret)
    .update(signatureManifest(input.dataId, input.xRequestId, parsed.timestamp))
    .digest();
  const received = Buffer.from(parsed.signature, "hex");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { valid: false, reason: "signature_mismatch" };
  }
  return { valid: true };
}

export function verifyMercadoPagoWebhookSignature(
  input: WebhookSignatureInput,
) {
  return inspectMercadoPagoWebhookSignature(input).valid;
}
