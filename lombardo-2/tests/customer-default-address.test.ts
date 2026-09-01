import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CUSTOMER_DELIVERY_CITIES,
  validateCustomerDefaultAddress,
} from "../lib/customer-address.ts";
import { deliveryMethodForCity } from "../lib/checkout/delivery-methods.ts";

function addressForm(overrides: Record<string, string> = {}) {
  const form = new FormData();
  const values = {
    street: "Córdoba",
    number: "1200",
    floorApartment: "4 B",
    city: "Rosario",
    province: "Santa Fe",
    postalCode: "S2000",
    references: "Portón azul",
    ...overrides,
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

test("la dirección predeterminada acepta sólo las zonas de entrega vigentes", () => {
  assert.deepEqual(CUSTOMER_DELIVERY_CITIES, [
    "Rosario",
    "Pueblo Esther",
    "Lagos",
    "Alvear",
  ]);
  assert.equal(deliveryMethodForCity("Rosario"), "DELIVERY_ROSARIO");
  assert.equal(deliveryMethodForCity("pueblo esther"), "DELIVERY_SOUTH");
  assert.equal(deliveryMethodForCity("Buenos Aires"), null);

  const valid = validateCustomerDefaultAddress(addressForm());
  assert.equal(valid.valid, true);
  if (valid.valid) {
    assert.deepEqual(valid.address, {
      street: "Córdoba",
      number: "1200",
      floorApartment: "4 B",
      city: "Rosario",
      province: "Santa Fe",
      postalCode: "S2000",
      references: "Portón azul",
    });
  }

  assert.deepEqual(
    validateCustomerDefaultAddress(addressForm({ city: "Buenos Aires" })),
    {
      valid: false,
      message: "Elegí una localidad dentro de las zonas de entrega disponibles.",
    },
  );
});

test("la dirección exige calle y número y limita datos no confiables", () => {
  assert.deepEqual(validateCustomerDefaultAddress(addressForm({ street: "" })), {
    valid: false,
    message: "Ingresá la calle.",
  });
  assert.deepEqual(validateCustomerDefaultAddress(addressForm({ number: "" })), {
    valid: false,
    message: "Ingresá el número.",
  });
  assert.equal(
    validateCustomerDefaultAddress(addressForm({ references: "x".repeat(501) })).valid,
    false,
  );
});

test("Mi cuenta guarda con sesión y RLS; checkout y Admin reutilizan la dirección", () => {
  const action = readFileSync("app/mi-cuenta/actions.ts", "utf8");
  const checkout = readFileSync("components/checkout/CheckoutPage.tsx", "utf8");
  const adminForm = readFileSync("components/admin/AdminOrderCreateForm.tsx", "utf8");
  const adminStore = readFileSync("lib/server/admin/runia-admin-store.ts", "utf8");
  const migration = readFileSync(
    "supabase/migrations/20260901142436_default_customer_address.sql",
    "utf8",
  );

  assert.match(action, /getCurrentCustomerAccount\(\)/);
  assert.match(action, /createSupabaseServerClient\(\)/);
  assert.match(action, /saveCustomerDefaultAddress/);
  assert.match(checkout, /customerDefaults\?\.defaultAddress/);
  assert.match(checkout, /stored &&[\s\S]*!stored\.order/);
  assert.match(adminForm, /nextCustomer\?\.defaultAddress/);
  assert.match(adminForm, /setDeliveryAddress\(nextAddress\)/);
  assert.match(adminStore, /account_addresses\?\$\{search\}/);

  assert.match(migration, /account_addresses_one_active_primary_idx/);
  assert.match(migration, /for insert[\s\S]*to authenticated[\s\S]*auth\.uid\(\)/i);
  assert.match(migration, /for update[\s\S]*to authenticated[\s\S]*auth\.uid\(\)/i);
  assert.match(migration, /revoke insert, update, delete[\s\S]*from anon, authenticated/i);
  assert.doesNotMatch(migration, /grant delete/i);
});
