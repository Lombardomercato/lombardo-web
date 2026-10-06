import assert from "node:assert/strict";
import test from "node:test";
import {
  isApiPath,
  isMaintenanceBypassPath,
  isMaintenanceModeEnabled,
  renderMaintenancePage,
} from "../lib/maintenance.ts";

test("el modo mantenimiento sólo se activa de forma explícita", () => {
  assert.equal(isMaintenanceModeEnabled("true"), true);
  assert.equal(isMaintenanceModeEnabled(" TRUE "), true);
  assert.equal(isMaintenanceModeEnabled("false"), false);
  assert.equal(isMaintenanceModeEnabled(undefined), false);
});

test("el mantenimiento bloquea la tienda y conserva los servicios operativos", () => {
  for (const pathname of ["/", "/productos", "/checkout", "/pedido/orden-1"]) {
    assert.equal(isMaintenanceBypassPath(pathname), false, pathname);
  }

  for (const pathname of [
    "/en-construccion",
    "/admin",
    "/admin/pedidos",
    "/auth/callback",
    "/api/cron/daily-automations",
    "/api/internal/runia/order-status/callback",
    "/api/payments/mercadopago/webhook",
  ]) {
    assert.equal(isMaintenanceBypassPath(pathname), true, pathname);
  }
});

test("las APIs públicas se pueden responder como temporalmente no disponibles", () => {
  assert.equal(isApiPath("/api/orders"), true);
  assert.equal(isApiPath("/api/catalog"), true);
  assert.equal(isApiPath("/productos"), false);
});

test("la pantalla informa la pausa sin navegación comercial", () => {
  const html = renderMaintenancePage();

  assert.match(html, /LOMBARDO\./);
  assert.match(html, /Estamos en construcción\./);
  assert.match(html, /Pausa temporal/i);
  assert.doesNotMatch(html, /href=/);
});
