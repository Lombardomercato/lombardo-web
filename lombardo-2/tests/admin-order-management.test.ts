import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  buildCustomerOrderUpdateEmail,
  buildCustomerOrderUpdateWhatsAppParameters,
  type CustomerOrderUpdateInput,
} from "../lib/server/notifications/customer-order-update-service.ts";

const migration = readFileSync(fileURLToPath(new URL(
  "../supabase/migrations/20260901144200_admin_order_management.sql",
  import.meta.url,
)), "utf8");
const orderActions = readFileSync(fileURLToPath(new URL(
  "../components/admin/OrderActions.tsx",
  import.meta.url,
)), "utf8");

function update(
  overrides: Partial<CustomerOrderUpdateInput["order"]> = {},
): CustomerOrderUpdateInput {
  return {
    kind: "customer_payment_status",
    eventKey: "payment-42",
    order: {
      id: "812",
      tenantId: "lombardo",
      publicId: "123e4567-e89b-42d3-a456-426614174000",
      customer: {
        firstName: "Ana",
        lastName: "Pérez",
        whatsapp: "+5493415550000",
        email: "ana@example.com",
      },
      fulfillmentStatus: "confirmed",
      paymentStatus: "approved",
      paymentMethod: "bank_transfer",
      deliveryMethod: "DELIVERY",
      deliveryCost: 4500,
      total: 34500,
      currency: "ARS",
      ...overrides,
    },
  };
}

test("Admin usa selectores reversibles para operación y pago", () => {
  assert.match(orderActions, /select[\s\S]*name="targetStatus"/);
  assert.match(orderActions, /Podés avanzar o volver a un estado anterior/);
  assert.match(orderActions, /name="paymentMethod"/);
  assert.match(orderActions, /name="paymentStatus"/);
  assert.match(orderActions, /name="deliveryCost"/);
  assert.doesNotMatch(orderActions, /NEXT_FULFILLMENT_ACTIONS/);
});

test("migración permite volver atrás sin reabrir cancelados", () => {
  assert.match(migration, /p_target_status not in \([\s\S]*'new'[\s\S]*'delivered'[\s\S]*'cancelled'/);
  assert.match(migration, /v_current_status = 'cancelled'/);
  assert.match(migration, /insert into public\.commerce_order_fulfillment_events/);
  assert.match(migration, /approved order requires refund workflow/);
});

test("pago y envío manual reutilizan la auditoría y el snapshot operativo", () => {
  assert.match(migration, /'bank_transfer', 'cash'/);
  assert.match(migration, /commerce_order_management_events_action_check[\s\S]*'payment_updated'/);
  assert.match(migration, /insert into public\.commerce_order_management_events/);
  assert.match(migration, /payment_manually_updated_by = p_operator_user_id/);
  assert.doesNotMatch(migration, /lombardo_admin_update_delivery_cost/);
});

test("RPCs de administración y auditoría siguen server-only", () => {
  assert.match(migration, /security invoker/g);
  assert.match(migration, /revoke all on function public\.lombardo_admin_update_payment/);
  assert.match(migration, /grant execute on function public\.lombardo_admin_update_payment[\s\S]*to service_role/);
});

test("notificaciones distinguen cada cambio y evitan duplicados", () => {
  assert.match(migration, /add column if not exists event_key text not null default 'initial'/);
  assert.match(migration, /unique \(\s*tenant_id, order_id, kind, channel, event_key\s*\)/);
  assert.match(migration, /customer_fulfillment_status/);
  assert.match(migration, /customer_payment_status/);
  assert.match(migration, /customer_delivery_update/);
  assert.match(migration, /lombardo_claim_order_notification_v4/);
});

test("email y WhatsApp explican pago manual sin inventar datos", () => {
  const input = update();
  const email = buildCustomerOrderUpdateEmail(
    input,
    "https://www.lombardomercato.com",
  );
  const parameters = buildCustomerOrderUpdateWhatsAppParameters(
    input,
    "https://www.lombardomercato.com",
  );
  assert.match(email.subject, /Pago aprobado/);
  assert.match(email.text, /transferencia bancaria/);
  assert.match(email.text, /\$\s?34\.500/);
  assert.match(email.idempotencyKey, /customer_payment_status-812-payment-42$/);
  assert.equal(parameters[0], "Ana");
  assert.equal(parameters[1], "123E4567");
  assert.match(parameters[3], /transferencia bancaria/);
  assert.match(parameters[5], /\/pedido\/123e4567-/);
});
