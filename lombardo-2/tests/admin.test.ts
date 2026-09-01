import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  customerWhatsAppUrl,
} from "../lib/admin/presentation.ts";
import type { AdminOrder } from "../lib/server/admin/types.ts";
import { parseAdminCustomerInput } from "../lib/server/customers/customer-admin-validation.ts";

const schemaPath = fileURLToPath(
  new URL("../supabase/schema/lombardo_admin_v1.sql", import.meta.url),
);
const schema = readFileSync(schemaPath, "utf8");
const notificationSchemaPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260824193813_lombardo_order_whatsapp_notifications.sql",
    import.meta.url,
  ),
);
const notificationSchema = readFileSync(notificationSchemaPath, "utf8");

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
  assert.match(schema, /p_target_status not in/);
  assert.match(schema, /v_current_status = 'cancelled'/);
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

test("notificación de pedido tiene outbox idempotente y server-only", () => {
  assert.match(
    notificationSchema,
    /unique \(\s*tenant_id, order_id, kind, channel\s*\)/,
  );
  assert.match(
    notificationSchema,
    /alter table public\.commerce_order_notifications force row level security/,
  );
  assert.match(
    notificationSchema,
    /revoke all on table public\.commerce_order_notifications\s+from public, anon, authenticated/,
  );
  assert.match(
    notificationSchema,
    /grant select, insert, update on table public\.commerce_order_notifications\s+to service_role/,
  );
  assert.match(
    notificationSchema,
    /p_allow_retry and v_notification\.status = 'failed'/,
  );
  assert.doesNotMatch(notificationSchema, /p_allow_retry.*status = 'unknown'/);
});

function customerForm(values: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("Admin acepta retail -10% y normaliza los datos comerciales", () => {
  const input = parseAdminCustomerInput(
    customerForm({
      name: "  Cliente VIP  ",
      email: "VIP@Example.com",
      whatsapp: "+54 9 341 555 1234",
      accountType: "RETAIL",
      pricingPolicy: "CUSTOM_DISCOUNT",
      discountPercent: "10",
      status: "active",
    }),
  );
  assert.deepEqual(input, {
    name: "Cliente VIP",
    email: "vip@example.com",
    whatsapp: "+5493415551234",
    accountType: "RETAIL",
    pricingPolicy: "CUSTOM_DISCOUNT",
    discountPercent: 10,
    status: "active",
  });
});

test("Admin rechaza combinaciones incoherentes de tipo, lista y descuento", () => {
  assert.throws(
    () =>
      parseAdminCustomerInput(
        customerForm({
          name: "Mayorista inválido",
          email: "mayorista@example.com",
          whatsapp: "+5493415551234",
          accountType: "WHOLESALE",
          pricingPolicy: "CUSTOM_DISCOUNT",
          discountPercent: "10",
          status: "active",
        }),
      ),
    /no son coherentes/,
  );
});

test("pedido nuevo permite elegir clientes existentes sin mezclar políticas comerciales", () => {
  const form = readFileSync(
    fileURLToPath(new URL("../components/admin/AdminOrderCreateForm.tsx", import.meta.url)),
    "utf8",
  );
  const ordersPage = readFileSync(
    fileURLToPath(new URL("../app/admin/(protected)/pedidos/page.tsx", import.meta.url)),
    "utf8",
  );
  const productSearch = readFileSync(
    fileURLToPath(new URL("../app/admin/api/orders/products/route.ts", import.meta.url)),
    "utf8",
  );
  const actions = readFileSync(
    fileURLToPath(new URL("../app/admin/actions.ts", import.meta.url)),
    "utf8",
  );
  const store = readFileSync(
    fileURLToPath(new URL("../lib/server/admin/runia-admin-store.ts", import.meta.url)),
    "utf8",
  );

  assert.match(ordersPage, /href="\/admin\/pedidos\/nuevo"/);
  assert.match(form, /name="customerId"/);
  assert.match(form, /CLIENTE OCASIONAL · MINORISTA/);
  assert.match(form, /setItems\(\[\]\)/);
  assert.match(productSearch, /getOptionalAdminSession/);
  assert.match(productSearch, /getCustomerOrderContext/);
  assert.match(productSearch, /quickOrderProvider\.searchProducts/);
  assert.match(actions, /createAdminOrderAction/);
  assert.match(actions, /parseCreateOrderInput/);
  assert.match(actions, /savePaymentMethod\([\s\S]*"whatsapp_coordination"/);
  assert.match(store, /customerAccountId: row\.id/);
  assert.match(store, /policy: row\.pricing_policy/);
  assert.doesNotMatch(form, /secretKey|service_role|sb_secret_/);
});
