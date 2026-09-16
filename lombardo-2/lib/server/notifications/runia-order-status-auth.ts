import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

function callbackTokenPayload(tenantId: string, notificationId: string) {
  return `lombardo-order-status-callback:${tenantId}:${notificationId}`;
}

export function createRuniaOrderStatusCallbackToken(
  secret: string,
  tenantId: string,
  notificationId: string,
) {
  return createHmac("sha256", secret)
    .update(callbackTokenPayload(tenantId, notificationId))
    .digest("hex");
}

export function verifyRuniaOrderStatusCallbackToken(
  token: string,
  secret: string,
  tenantId: string,
  notificationId: string,
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const expected = Buffer.from(
    createRuniaOrderStatusCallbackToken(secret, tenantId, notificationId),
  );
  const actual = Buffer.from(token);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
