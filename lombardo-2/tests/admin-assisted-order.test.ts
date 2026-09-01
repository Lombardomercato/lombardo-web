import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  AdminAssistedOrderError,
  adminAssistedManagementMatches,
  buildAdminAssistedManagement,
  parseAdminAssistedOrderItems,
} from "../lib/server/orders/admin-assisted-order.ts";
import type { OrderDraft } from "../types/checkout.ts";

const productId = "12345678-1234-4123-8123-123456789abc";

function order(): OrderDraft {
  return {
    id: "123",
    publicId: "22345678-1234-4123-8123-123456789abc",
    tenantId: "lombardo",
    tenantRecordId: "32345678-1234-4123-8123-123456789abc",
    customerAccountId: "42345678-1234-4123-8123-123456789abc",
    pricingPolicy: "CUSTOM_DISCOUNT",
    discountPercent: 15,
    checkoutSessionId: "admin_session_123456789",
    idempotencyKey: "admin_order_123456789",
    orderSource: "admin_manual",
    items: [{
      productId,
      sku: "VIN001",
      name: "Vino de prueba",
      baseUnitPrice: 1000,
      priceType: "retail",
      pricingPolicy: "CUSTOM_DISCOUNT",
      discountPercent: 15,
      discountAmount: 150,
      commercialUnitPrice: 850,
      policyDiscountAmount: 150,
      couponDiscountAmount: 0,
      finalUnitPrice: 850,
      unitPrice: 850,
      quantity: 2,
      lineBaseTotal: 2000,
      lineDiscount: 300,
      lineCommercialTotal: 1700,
      lineCouponDiscount: 0,
      lineFinalTotal: 1700,
      lineTotal: 1700,
    }],
    customer: {
      firstName: "Gisela",
      lastName: "",
      whatsapp: "+5493415551234",
      email: "gisela@example.com",
    },
    deliveryMethod: "DELIVERY_ROSARIO",
    deliveryAddress: {
      street: "Córdoba",
      number: "1200",
      city: "Rosario",
      province: "Santa Fe",
    },
    deliveryCostMode: "FREE",
    baseSubtotal: 2000,
    pricingDiscountAmount: 300,
    commercialSubtotal: 1700,
    subtotal: 1700,
    deliveryCost: 0,
    total: 1700,
    currency: "ARS",
    orderStatus: "pending_payment",
    paymentStatus: "pending",
    paymentMethod: "whatsapp_coordination",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

test("la venta asistida acepta cantidad y precio manual válidos", () => {
  const submitted = parseAdminAssistedOrderItems([{
    productId,
    quantity: 2,
    expectedUnitPrice: 850,
    manualUnitPrice: 800,
  }]);
  const management = buildAdminAssistedManagement(
    order(),
    submitted,
    "Precio acordado por WhatsApp",
  );
  assert.ok(management);
  assert.equal(management.items[0].catalogUnitPrice, 850);
  assert.equal(management.items[0].unitPrice, 800);
  assert.equal(management.items[0].lineTotal, 1600);
  assert.equal(management.total, 1600);
  assert.equal(management.discountReason, "Precio acordado por WhatsApp");
});

test("el servidor ignora totales del browser y exige motivo auditable", () => {
  const submitted = parseAdminAssistedOrderItems([{
    productId,
    quantity: 2,
    expectedUnitPrice: 850,
    manualUnitPrice: 800,
    total: 1,
  }]);
  assert.throws(
    () => buildAdminAssistedManagement(order(), submitted, ""),
    AdminAssistedOrderError,
  );
});

test("un reintento idempotente reconoce el precio manual ya aplicado", () => {
  const submitted = parseAdminAssistedOrderItems([{
    productId,
    quantity: 2,
    expectedUnitPrice: 850,
    manualUnitPrice: 800,
  }]);
  const effective = buildAdminAssistedManagement(
    order(),
    submitted,
    "Precio acordado",
  );
  assert.ok(effective);
  assert.equal(
    adminAssistedManagementMatches(effective.items, submitted),
    true,
  );
});

test("los formularios capturan el valor del input antes de actualizar estado", () => {
  const createForm = readFileSync(
    "components/admin/AdminOrderCreateForm.tsx",
    "utf8",
  );
  const editForm = readFileSync("components/admin/AdminOrderForm.tsx", "utf8");
  assert.match(
    createForm,
    /const quantity = boundedQuantity\(event\.currentTarget\.valueAsNumber\)/,
  );
  assert.match(createForm, /const unitPriceInput = event\.currentTarget\.value/);
  assert.match(editForm, /const quantity = Math\.min/);
  assert.match(editForm, /const unitPrice = Math\.max/);
  assert.doesNotMatch(
    createForm,
    /setItems\(\(current\)[\s\S]{0,240}event\.currentTarget/,
  );
});
