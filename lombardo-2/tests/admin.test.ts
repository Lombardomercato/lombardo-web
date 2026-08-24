import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  customerWhatsAppUrl,
  NEXT_FULFILLMENT_ACTIONS,
} from "../lib/admin/presentation.ts";
import type { AdminOrder } from "../lib/server/admin/types.ts";

const schemaPath = fileURLToPath(
  new URL("../supabase/schema/lombardo_admin_v1.sql", import.meta.url),
);
const schema = readFileSync(schemaPath, "utf8");

test("Admin mantiene fulfillment separado de order_status y payment_status", () => {
  assert.match(schema, /add column if not exists fulfillment_status text/);
  assert.equal(
    [...schema.matchAll(/update public\.commerce_orders\s+set/g)].length,
    1,
    "sólo puede existir el UPDATE dentro de la transición explícita",
  );
  assert.doesNotMatch(schema, /fulfillment_status set not null/);
  assert.doesNotMatch(schema, /payment_status\s*=\s*p_target_status/);
  assert.match(
    schema,
    /when p_target_status = 'cancelled' then 'cancelled'\s+else order_status/,
  );
});

test("transiciones operativas son validadas, auditadas e idempotentes", () => {
  assert.match(schema, /v_current_status := coalesce/);
  assert.match(schema, /if v_current_status = p_target_status then/);
  assert.match(schema, /if v_current_status <> p_expected_status then/);
  assert.match(schema, /invalid fulfillment transition/);
  assert.match(schema, /insert into public\.commerce_order_fulfillment_events/);
  assert.deepEqual(
    NEXT_FULFILLMENT_ACTIONS.preparing.map((action) => action.target),
    ["ready", "cancelled"],
  );
  assert.deepEqual(NEXT_FULFILLMENT_ACTIONS.delivered, []);
});

test("tablas Admin no dan acceso al navegador ni exponen service_role", () => {
  assert.match(
    schema,
    /revoke all on table public\.lombardo_admin_sessions from public, anon, authenticated/,
  );
  assert.match(
    schema,
    /revoke all on function public\.lombardo_transition_fulfillment_status/,
  );
  assert.doesNotMatch(schema, /grant .* to anon/);
  assert.doesNotMatch(schema, /grant .* to authenticated/);
});

test("contacto WhatsApp usa contexto del pedido y omite datos sensibles", () => {
  const order = {
    displayId: "ABC12345",
    customer: {
      firstName: "Ana",
      lastName: "Pérez",
      whatsapp: "0351 555-1234",
      email: "ana@example.com",
      dni: "12345678",
    },
  } as AdminOrder;
  const url = customerWhatsAppUrl(order);
  const message = decodeURIComponent(url.split("text=")[1] || "");
  assert.match(url, /^https:\/\/wa\.me\/543515551234\?/);
  assert.match(message, /Ana/);
  assert.match(message, /ABC12345/);
  assert.doesNotMatch(message, /ana@example\.com|12345678/);
});
