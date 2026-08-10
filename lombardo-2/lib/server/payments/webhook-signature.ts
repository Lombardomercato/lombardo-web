import { createHmac, timingSafeEqual } from "node:crypto";

export interface WebhookSignatureInput {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  now?: number;
  toleranceSeconds?: number;
}

function parseSignature(value: string | null) {
  if (!value) return null;
  const fields = new Map(
    value.split(",").map((part) => {
      const [key, ...rest] = part.trim().split("=");
      return [key, rest.join("=")];
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
  const normalizedDataId = dataId && /[a-z]/i.test(dataId)
    ? dataId.toLocaleLowerCase("en-US")
    : dataId;
  return [
    normalizedDataId ? `id:${normalizedDataId};` : "",
    requestId ? `request-id:${requestId};` : "",
    `ts:${timestamp};`,
  ].join("");
}

export function verifyMercadoPagoWebhookSignature(
  input: WebhookSignatureInput,
) {
  const parsed = parseSignature(input.xSignature);
  if (!parsed || !input.secret) return false;
  if (!/^[a-f0-9]{64}$/i.test(parsed.signature)) return false;

  const rawTimestamp = Number(parsed.timestamp);
  if (!Number.isFinite(rawTimestamp)) return false;
  const timestampMs = parsed.timestamp.length <= 10
    ? rawTimestamp * 1000
    : rawTimestamp;
  const now = input.now ?? Date.now();
  const toleranceMs = (input.toleranceSeconds ?? 300) * 1000;
  if (Math.abs(now - timestampMs) > toleranceMs) return false;

  const expected = createHmac("sha256", input.secret)
    .update(signatureManifest(input.dataId, input.xRequestId, parsed.timestamp))
    .digest();
  const received = Buffer.from(parsed.signature, "hex");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
