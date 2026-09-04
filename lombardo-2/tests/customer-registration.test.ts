import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { validateCustomerRegistration } from "../lib/server/customers/validation.ts";

function registrationForm(overrides: Record<string, string> = {}) {
  const values = {
    name: "Ana Pérez",
    email: "ANA@EXAMPLE.COM",
    whatsapp: "+54 9 341 555 1234",
    password: "una-clave-segura",
    passwordConfirmation: "una-clave-segura",
    ...overrides,
  };
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

test("el registro público normaliza datos válidos", () => {
  const result = validateCustomerRegistration(registrationForm());
  assert.equal(result.valid, true);
  if (!result.valid) return;
  assert.deepEqual(result.values, {
    name: "Ana Pérez",
    email: "ana@example.com",
    whatsapp: "+5493415551234",
    password: "una-clave-segura",
  });
});

test("el registro público rechaza WhatsApp y contraseñas inválidas", () => {
  assert.equal(
    validateCustomerRegistration(registrationForm({ whatsapp: "3415551234" })).valid,
    false,
  );
  assert.equal(
    validateCustomerRegistration(registrationForm({ password: "corta", passwordConfirmation: "corta" })).valid,
    false,
  );
  assert.equal(
    validateCustomerRegistration(registrationForm({ passwordConfirmation: "otra-clave-segura" })).valid,
    false,
  );
});

test("la cuenta pública fuerza retail sin descuentos ni permisos elegibles", () => {
  const service = readFileSync(
    new URL("../lib/server/customers/customer-registration.ts", import.meta.url),
    "utf8",
  );
  const form = readFileSync(
    new URL("../components/customer/CustomerRegistrationForm.tsx", import.meta.url),
    "utf8",
  );
  assert.match(service, /accountType:\s*"RETAIL"/);
  assert.match(service, /pricingPolicy:\s*"RETAIL"/);
  assert.match(service, /discountPercent:\s*0/);
  assert.doesNotMatch(form, /name="(?:accountType|pricingPolicy|discountPercent)"/);
});

test("los controles rápidos y el editor completo no comparten layout CSS", () => {
  const actions = readFileSync(
    new URL("../components/admin/OrderActions.tsx", import.meta.url),
    "utf8",
  );
  const editor = readFileSync(
    new URL("../components/admin/AdminOrderForm.tsx", import.meta.url),
    "utf8",
  );
  assert.match(actions, /styles\.orderManagementForm/);
  assert.match(editor, /styles\.orderEditorForm/);
  assert.doesNotMatch(editor, /styles\.orderManagementForm/);
});
