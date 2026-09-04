import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  authorizeRuniaCommerceRequest,
  createPricingAssertion,
  readRuniaCommerceBridgeConfiguration,
  verifyPricingAssertion,
} from "../lib/server/ai/runia-bridge.ts";
import type { CustomerPricingContext } from "../lib/server/customers/types.ts";

const root = new URL("..", import.meta.url);
const token = "runia_bridge_abcdefghijklmnopqrstuvwxyz_1234567890_ABCDEF";
const companyId = "3fa6e368-2a25-47a2-b31c-618d6d9dc456";
const configuration = readRuniaCommerceBridgeConfiguration({
  RUNIA_COMMERCE_BRIDGE_TOKEN: token,
  RUNIA_COMMERCE_BRIDGE_ALLOWED_ORIGINS: "https://runia.ar",
});
const retail: CustomerPricingContext = {
  tenantRecordId: "11111111-1111-4111-8111-111111111111",
  tenantSlug: "lombardo",
  accountType: "RETAIL",
  policy: "RETAIL",
  basePriceType: "retail",
  discountPercent: 0,
  contextKey: "guest:RETAIL",
};

test("el bridge exige token dedicado, company allowlist y Origin permitido", () => {
  const allowed = new Request("https://www.lombardomercato.com/api/runia/commerce", {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-Runia-Company-Id": companyId,
      Origin: "https://runia.ar",
    },
  });
  assert.equal(authorizeRuniaCommerceRequest(allowed, configuration), true);
  assert.equal(authorizeRuniaCommerceRequest(new Request(allowed, {
    headers: { ...Object.fromEntries(allowed.headers), Authorization: "Bearer wrong" },
  }), configuration), false);
  assert.equal(authorizeRuniaCommerceRequest(new Request(allowed, {
    headers: { ...Object.fromEntries(allowed.headers), "X-Runia-Company-Id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
  }), configuration), false);
  assert.equal(authorizeRuniaCommerceRequest(new Request(allowed, {
    headers: { ...Object.fromEntries(allowed.headers), Origin: "https://evil.example" },
  }), configuration), false);
});

test("la identidad comercial viaja en una assertion corta, firmada y tenant-fixed", () => {
  const wholesale: CustomerPricingContext = {
    ...retail,
    authUserId: "22222222-2222-4222-8222-222222222222",
    customerAccountId: "33333333-3333-4333-8333-333333333333",
    accountType: "WHOLESALE",
    policy: "WHOLESALE",
    basePriceType: "wholesale",
    contextKey: "customer:33333333-3333-4333-8333-333333333333:WHOLESALE:0",
  };
  const now = Date.UTC(2026, 8, 1);
  const assertion = createPricingAssertion(wholesale, configuration, now);
  assert.equal(verifyPricingAssertion(assertion, configuration, retail, now).policy, "WHOLESALE");
  assert.throws(() => verifyPricingAssertion(`${assertion}x`, configuration, retail, now), /INVALID/);
  assert.throws(() => verifyPricingAssertion(assertion, configuration, retail, now + 11 * 60_000), /EXPIRED/);
  assert.throws(() => verifyPricingAssertion(assertion, configuration, {
    ...retail,
    tenantRecordId: "44444444-4444-4444-8444-444444444444",
  }, now), /CROSS_TENANT/);
});

test("la superficie server-to-server queda limitada a las siete operaciones y no crea órdenes", () => {
  const route = source("app/api/runia/commerce/route.ts");
  const tools = source("lib/server/ai/tools.ts");
  const contextRoute = source("app/api/ai/runia-context/route.ts");
  assert.match(route, /authorizeRuniaCommerceRequest/);
  assert.match(route, /consumeRateLimit/);
  assert.match(route, /eventName: "tool_call"/);
  assert.match(route, /executeCommerceOperation/);
  assert.match(route, /tenantSlug !== "lombardo"/);
  assert.doesNotMatch(route, /createOrder|service_role|from\(/i);
  assert.match(contextRoute, /createPricingAssertion/);
  for (const operation of [
    "search_products",
    "get_product",
    "recommend_products",
    "get_effective_price",
    "get_opportunities",
    "search_guides",
    "build_selection",
  ]) assert.match(tools, new RegExp(`"${operation}"`));
});

test("la credencial nunca aparece en código cliente", () => {
  const assistant = source("components/ai/SalesAssistant.tsx");
  assert.doesNotMatch(assistant, /RUNIA_COMMERCE_BRIDGE_TOKEN|X-Runia-Company-Id|\/api\/runia\/commerce/);
});

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}
