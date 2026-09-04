import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { tolerantQueries } from "../lib/search/tolerant-product-query.ts";

const root = new URL("..", import.meta.url);

function source(path: string) {
  return readFileSync(new URL(path, root), "utf8");
}

test("ALARIS y las frases naturales generan búsquedas progresivas sin respuestas internas", () => {
  assert.deepEqual(tolerantQueries("ALARIS"), ["ALARIS", "alaris"]);
  assert.deepEqual(
    tolerantQueries("¿Tenés una botella ALARIS?"),
    ["¿Tenés una botella ALARIS?", "alaris"],
  );
  const tools = source("lib/server/ai/tools.ts");
  assert.match(tools, /productIdFromQuery/);
  assert.match(tools, /lombardomercato\.com/);
});

test("el carrito de WhatsApp es estructurado y se reprecifica en cada mutación", () => {
  const commerce = source("lib/server/ai/whatsapp-commerce.ts");
  for (const field of [
    "productId",
    "name",
    "quantity",
    "effectiveUnitPrice",
    "lineTotal",
  ]) assert.match(commerce, new RegExp(field));
  assert.match(commerce, /await repriceCart/);
  assert.match(commerce, /set_quantity/);
  assert.match(commerce, /action: z\.enum\(\["add", "remove"/);
});

test("la confirmación usa el repositorio existente, snapshots y los tres pagos", () => {
  const commerce = source("lib/server/ai/whatsapp-commerce.ts");
  const coordinator = source("lib/server/payments/order-payment-coordinator.ts");
  assert.match(commerce, /createCheckoutCoordinator/);
  assert.match(commerce, /orderSource: "whatsapp"/);
  assert.match(commerce, /conversationSessionId: context\.sessionId/);
  assert.match(commerce, /expectedUnitPrice: item\.effectiveUnitPrice/);
  assert.match(coordinator, /paymentMethod !== "mercado_pago"/);
  for (const method of ["mercado_pago", "bank_transfer", "cash"]) {
    assert.match(commerce, new RegExp(method));
  }
});

test("la migración conserva una sola tabla de pedidos y permite resolver sólo una cuenta verificada", () => {
  const migration = source("supabase/migrations/20260904120000_whatsapp_commerce_orders.sql");
  assert.match(migration, /alter table public\.commerce_orders/);
  assert.doesNotMatch(migration, /create table .*whatsapp.*order/i);
  assert.match(migration, /order_source in \('storefront', 'admin_manual', 'whatsapp'\)/);
  assert.match(migration, /commerce_orders_whatsapp_session_key/);
  assert.match(migration, /lombardo_resolve_whatsapp_customer/);
  assert.match(migration, /where match_count = 1/);
  assert.match(migration, /to service_role/);
});

test("Admin distingue el origen WhatsApp y muestra sesión, factura y observaciones", () => {
  const page = source("app/admin/(protected)/pedidos/[publicId]/page.tsx");
  const store = source("lib/server/admin/runia-admin-store.ts");
  assert.match(page, /order\.orderSource === "whatsapp" \? "WHATSAPP"/);
  assert.match(page, /SESIÓN RUNIA/);
  assert.match(page, /FACTURA A/);
  assert.match(store, /"channel_context"/);
  assert.match(store, /"invoice_details"/);
});

test("envío estándar es gratis y prioritario sólo Rosario por 10000", async () => {
  const { EnvironmentDeliveryPricing } = await import("../lib/server/orders/server-delivery-pricing.ts");
  const pricing = new EnvironmentDeliveryPricing();
  const previous = process.env.DELIVERY_COST_MODE;
  process.env.DELIVERY_COST_MODE = "FREE";
  try {
    assert.deepEqual(pricing.getQuote("DELIVERY_ROSARIO", "standard"), {
      mode: "FREE",
      amount: 0,
      label: "Sin costo",
    });
    assert.deepEqual(pricing.getQuote("DELIVERY_ROSARIO", "priority"), {
      mode: "FLAT_RATE",
      amount: 10_000,
      label: "Envío prioritario · en el día",
    });
    assert.throws(
      () => pricing.getQuote("DELIVERY_SOUTH", "priority"),
      /PRIORITY_DELIVERY_ONLY_ROSARIO/,
    );
  } finally {
    if (previous === undefined) delete process.env.DELIVERY_COST_MODE;
    else process.env.DELIVERY_COST_MODE = previous;
  }
});

test("transferencia conserva pago pendiente y exige revisión humana del comprobante", () => {
  const commerce = source("lib/server/ai/whatsapp-commerce.ts");
  const migration = source("supabase/migrations/20260904130000_close_lombardo_checkout.sql");
  const admin = source("app/admin/(protected)/pedidos/[publicId]/page.tsx");
  assert.match(commerce, /register_whatsapp_payment_proof/);
  assert.match(commerce, /paymentStatus: order\.paymentStatus/);
  assert.match(commerce, /proof_pending_review/);
  assert.match(commerce, /handoffReason: "REVISAR COMPROBANTE"/);
  assert.doesNotMatch(commerce, /paymentStatus:\s*"approved"/);
  assert.match(migration, /commerce_order_payment_proofs/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all .* from public, anon, authenticated/);
  assert.match(admin, /REVISAR COMPROBANTE/);
});

test("cada orden WhatsApp devuelve pago y seguimiento de la misma orden", () => {
  const commerce = source("lib/server/ai/whatsapp-commerce.ts");
  const payments = source("lib/server/payments/mercado-pago-adapter.ts");
  assert.match(commerce, /paymentLink: result\.payment\?\.checkoutUrl/);
  assert.match(commerce, /trackingLink\(result\.order\.publicId\)/);
  assert.match(commerce, /get_whatsapp_order_status/);
  assert.match(payments, /external_reference: order\.id/);
  assert.match(payments, /order_id: order\.id/);
});

test("checkout web ofrece prioridad sólo dentro de Rosario", () => {
  const checkout = source("components/checkout/CheckoutPage.tsx");
  assert.match(checkout, /deliveryMethod === "DELIVERY_ROSARIO"/);
  assert.match(checkout, /setDeliveryService\("priority"\)/);
  assert.match(checkout, /En el día/);
  assert.match(checkout, /10_000/);
});
