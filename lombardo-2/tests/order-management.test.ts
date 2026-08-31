import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AdminOrderValidationError,
  buildAdminOrderManagementInput,
  parseAdminOrderPayload,
} from "../lib/server/orders/admin-order-validation.ts";
import type { AdminProduct } from "../lib/server/admin/types.ts";

const migration = readFileSync(
  "supabase/migrations/20260831215909_lombardo_order_management.sql",
  "utf8",
);
const verification = readFileSync(
  "supabase/verification/verify_lombardo_order_management.sql",
  "utf8",
);
const form = readFileSync("components/admin/AdminOrderForm.tsx", "utf8");
const actions = readFileSync("app/admin/actions.ts", "utf8");
const shortcut = readFileSync("app/pedidos/page.tsx", "utf8");
const header = readFileSync("components/layout/Header.tsx", "utf8");
const adminShell = readFileSync("components/admin/AdminShell.tsx", "utf8");

const product: AdminProduct = {
  id: "12345678-1234-4123-8123-123456789abc",
  sku: "VIN001",
  name: "Vino de prueba",
  presentation: "750 ml",
  category: "Vinos",
  categorySlug: "vinos",
  brand: "Lombardo",
  retailPrice: 1000,
  active: true,
  eligibilityStatus: "safe",
  publicationStatus: "published",
};

function payload(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    customer: {
      firstName: "Ana",
      lastName: "Pérez",
      whatsapp: "+5493415551234",
      email: "ana@example.com",
    },
    items: [{ productId: product.id, quantity: 2, unitPrice: 900 }],
    deliveryMethod: "DELIVERY_ROSARIO",
    deliveryAddress: {
      street: "Córdoba",
      number: "1200",
      city: "Rosario",
      province: "Santa Fe",
    },
    deliveryCost: 100,
    discountAmount: 180,
    discountReason: "Precio acordado",
    notes: "Pedido telefónico",
    paymentStatus: "pending",
    ...overrides,
  });
}

test("los totales de gestión se reconstruyen server-side desde productos, cantidades y precios", () => {
  const parsed = parseAdminOrderPayload(payload({ total: 1, subtotal: 1 }));
  const result = buildAdminOrderManagementInput(parsed, [product]);
  assert.equal(result.itemsSubtotal, 1800);
  assert.equal(result.discountAmount, 180);
  assert.equal(result.subtotal, 1620);
  assert.equal(result.deliveryCost, 100);
  assert.equal(result.total, 1720);
  assert.equal(result.items[0].catalogUnitPrice, 1000);
  assert.equal(result.items[0].manualPriceOverride, true);
});

test("precio editado o descuento manual requieren motivo auditable", () => {
  const parsed = parseAdminOrderPayload(payload({ discountAmount: 0, discountReason: "" }));
  assert.throws(
    () => buildAdminOrderManagementInput(parsed, [product]),
    AdminOrderValidationError,
  );
});

test("el formulario rechaza productos repetidos y descuentos mayores al pedido", () => {
  assert.throws(
    () => parseAdminOrderPayload(payload({
      items: [
        { productId: product.id, quantity: 1, unitPrice: 1000 },
        { productId: product.id, quantity: 1, unitPrice: 1000 },
      ],
    })),
    /repetidos/,
  );
  const parsed = parseAdminOrderPayload(payload({
    items: [{ productId: product.id, quantity: 1, unitPrice: 1000 }],
    discountAmount: 1001,
  }));
  assert.throws(
    () => buildAdminOrderManagementInput(parsed, [product]),
    /no puede superar/,
  );
});

test("un pedido manual nuevo usa únicamente zonas de entrega vigentes", () => {
  assert.doesNotThrow(() => parseAdminOrderPayload(payload(), {
    allowLegacyDeliveryMethods: false,
  }));
  assert.throws(
    () => parseAdminOrderPayload(payload({ deliveryMethod: "PICKUP" }), {
      allowLegacyDeliveryMethods: false,
    }),
    /zona de entrega vigente/,
  );
  assert.throws(
    () => parseAdminOrderPayload(payload({
      deliveryMethod: "DELIVERY_SOUTH",
      deliveryAddress: {
        street: "Córdoba",
        number: "1200",
        city: "Rosario",
        province: "Santa Fe",
      },
    })),
    /localidad no corresponde/,
  );
});

test("la base conserva el snapshot comercial y audita cada edición con concurrencia", () => {
  assert.match(migration, /operational, auditable layer over immutable commerce snapshots/i);
  assert.match(migration, /management_revision <> p_expected_revision/);
  assert.match(migration, /for update;/);
  assert.match(migration, /insert into public\.commerce_order_management_events/);
  assert.match(migration, /management_items = v_items/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.lombardo_admin_update_order_management[\s\S]*?\nend;\n\$\$;/)?.[0] ?? "",
    /\n\s*items = v_items/,
  );
});

test("RLS y RPC de gestión quedan cerradas al browser y autorizan operador server-side", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.commerce_order_management_events[\s\S]*public, anon, authenticated/);
  assert.match(migration, /admin_operator\.auth_user_id = p_operator_user_id[\s\S]*admin_operator\.active/);
  assert.match(migration, /revoke all on function public\.lombardo_admin_create_order/);
  assert.match(verification, /v_browser_grants <> 0/);
  assert.match(verification, /v_browser_function_grants <> 0/);
});

test("Admin expone alta, edición, precios manuales, descuento y acceso /pedidos", () => {
  assert.match(form, /CREAR PEDIDO MANUAL/);
  assert.match(form, /GUARDAR CAMBIOS/);
  assert.match(form, /PRECIO UNIT\./);
  assert.match(form, /Descuento manual/);
  assert.match(actions, /requireAdminRole\("admin"\)/);
  assert.match(shortcut, /redirect\("\/admin\/pedidos"\)/);
});

test("los logos principales incorporan un trademark de escala secundaria", () => {
  assert.match(header, /styles\.trademark[\s\S]*™/);
  assert.match(adminShell, /styles\.adminTrademark[\s\S]*™/);
});
