import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import type { CustomerPricingContext } from "@/lib/server/customers/types";

const LOMBARDO_COMPANY_ID = "3fa6e368-2a25-47a2-b31c-618d6d9dc456";
const DEFAULT_ALLOWED_ORIGINS = [
  "https://runia.ar",
  "https://www.runia.ar",
];

const pricingAssertionSchema = z.object({
  v: z.literal(1),
  exp: z.number().int().positive(),
  tenantRecordId: z.string().uuid(),
  tenantSlug: z.literal("lombardo"),
  authUserId: z.string().uuid().optional(),
  customerAccountId: z.string().uuid().optional(),
  accountType: z.enum(["RETAIL", "WHOLESALE", "BUSINESS"]),
  policy: z.enum(["RETAIL", "WHOLESALE", "BUSINESS", "CUSTOM_DISCOUNT"]),
  basePriceType: z.enum(["retail", "wholesale", "business"]),
  discountPercent: z.number().min(0).max(99),
  contextKey: z.string().min(1).max(180),
}).strict();

export interface RuniaCommerceBridgeConfiguration {
  companyId: string;
  token: string;
  allowedOrigins: ReadonlySet<string>;
}

export function readRuniaCommerceBridgeConfiguration(
  env: Record<string, string | undefined> = process.env,
): RuniaCommerceBridgeConfiguration {
  const token = env.RUNIA_COMMERCE_BRIDGE_TOKEN?.trim();
  if (!token || token.length < 48 || /\s/.test(token)) {
    throw new Error("RUNIA_COMMERCE_BRIDGE_TOKEN_INVALID");
  }
  const configuredOrigins = env.RUNIA_COMMERCE_BRIDGE_ALLOWED_ORIGINS
    ?.split(",")
    .map((origin) => normalizeOrigin(origin.trim()))
    .filter((origin): origin is string => Boolean(origin));
  return {
    companyId: LOMBARDO_COMPANY_ID,
    token,
    allowedOrigins: new Set(configuredOrigins?.length ? configuredOrigins : DEFAULT_ALLOWED_ORIGINS),
  };
}

export function authorizeRuniaCommerceRequest(
  request: Request,
  configuration: RuniaCommerceBridgeConfiguration,
) {
  const companyId = request.headers.get("x-runia-company-id")?.trim();
  if (companyId !== configuration.companyId) return false;

  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const prefix = "Bearer ";
  if (!authorization.startsWith(prefix)) return false;
  if (!secureEqual(authorization.slice(prefix.length), configuration.token)) return false;

  const origin = request.headers.get("origin");
  if (!origin) return true;
  const normalized = normalizeOrigin(origin);
  return Boolean(normalized && configuration.allowedOrigins.has(normalized));
}

export function createPricingAssertion(
  pricing: CustomerPricingContext,
  configuration: RuniaCommerceBridgeConfiguration,
  now = Date.now(),
) {
  if (!pricing.tenantRecordId || pricing.tenantSlug !== "lombardo") {
    throw new Error("RUNIA_PRICING_ASSERTION_TENANT_INVALID");
  }
  const payload = pricingAssertionSchema.parse({
    v: 1,
    exp: Math.floor(now / 1000) + 10 * 60,
    ...pricing,
  });
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, configuration.token)}`;
}

export function verifyPricingAssertion(
  assertion: string,
  configuration: RuniaCommerceBridgeConfiguration,
  fallback: CustomerPricingContext,
  now = Date.now(),
): CustomerPricingContext {
  const [encoded, signature, extra] = assertion.split(".");
  if (!encoded || !signature || extra || !secureEqual(signature, sign(encoded, configuration.token))) {
    throw new Error("RUNIA_PRICING_ASSERTION_INVALID");
  }
  const payload = pricingAssertionSchema.parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (payload.exp < Math.floor(now / 1000)) throw new Error("RUNIA_PRICING_ASSERTION_EXPIRED");
  if (payload.tenantSlug !== "lombardo" || payload.tenantRecordId !== fallback.tenantRecordId) {
    throw new Error("RUNIA_PRICING_ASSERTION_CROSS_TENANT");
  }
  return {
    tenantRecordId: payload.tenantRecordId,
    tenantSlug: payload.tenantSlug,
    authUserId: payload.authUserId,
    customerAccountId: payload.customerAccountId,
    accountType: payload.accountType,
    policy: payload.policy,
    basePriceType: payload.basePriceType,
    discountPercent: payload.discountPercent,
    contextKey: payload.contextKey,
  };
}

function sign(value: string, token: string) {
  return createHmac("sha256", token).update(`lombardo-pricing:v1:${value}`).digest("base64url");
}

function secureEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeOrigin(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) return null;
    return url.origin;
  } catch {
    return null;
  }
}
