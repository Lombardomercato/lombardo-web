import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { classifyCommercialIntent } from "../lib/server/ai/topic.ts";
import { wholesaleProgressCopy } from "../lib/pricing/volume-tier-ui.ts";

const root = new URL("..", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("los mensajes 2–6 son progresivos, surtidos y no agresivos", () => {
  assert.match(wholesaleProgressCopy(2), /4 más/);
  assert.match(wholesaleProgressCopy(3), /mitad de camino/);
  assert.match(wholesaleProgressCopy(4), /faltan sólo 2/);
  assert.match(wholesaleProgressCopy(5), /una más/);
  assert.match(wholesaleProgressCopy(6), /PRECIO MAYORISTA ACTIVADO/);
  const component = source("components/wholesale/WholesaleProgress.tsx");
  assert.match(component, /No hace falta llevar seis iguales/);
  assert.doesNotMatch(component, /COMPRE MÁS|DEBE AGREGAR|OFERTA IMPERDIBLE/);
});

test("carrito lateral, carrito, ficha y checkout comparten la experiencia", () => {
  assert.match(source("components/cart/CartDrawer.tsx"), /WholesaleProgress/);
  assert.match(source("components/cart/CartPage.tsx"), /WholesaleProgress/);
  assert.match(source("components/product/ProductDetail.tsx"), /6 botellas surtidas/);
  assert.match(source("components/checkout/CheckoutPage.tsx"), /WholesaleProgress items=\{items\} compact checkout/);
});

test("Portal Negocios reutiliza precios, Pedido Rápido, repetición, pedidos y cuenta", () => {
  const account = source("app/mi-cuenta/page.tsx");
  for (const label of ["PORTAL NEGOCIOS", "PEDIDO RÁPIDO", "MIS PRECIOS", "REPETIR PEDIDO", "MIS PEDIDOS", "DATOS DE CUENTA"]) {
    assert.match(account, new RegExp(label));
  }
  assert.match(source("app/pedido-rapido/page.tsx"), /WHOLESALE|BUSINESS|accountType/);
});

test("catálogo y consultas de reventa tienen respuesta canónica y verificación", () => {
  for (const phrase of ["me pasas lista?", "tenes catalogo?", "lista mayorista"]) {
    assert.equal(classifyCommercialIntent(phrase), "catalog");
  }
  for (const phrase of ["tengo un kiosco", "es para mi restaurante", "quiero precios para revender"]) {
    assert.equal(classifyCommercialIntent(phrase), "business");
  }
  assert.equal(classifyCommercialIntent("no quiero sumar más, cerrame las 4"), "decline_upsell");
  const tools = source("lib/server/ai/tools.ts");
  assert.match(tools, /https:\/\/www\.lombardomercato\.com\/productos/);
  assert.match(tools, /requiresVerification: true/);
});

test("WhatsApp menciona el beneficio una vez y permite descartarlo sin insistencia", () => {
  const commerce = source("lib/server/ai/whatsapp-commerce.ts");
  assert.match(commerce, /wholesaleUpsellMentioned/);
  assert.match(commerce, /wholesaleUpsellDeclined/);
  assert.match(commerce, /decline_wholesale_upsell/);
  assert.match(commerce, /commercialSuggestion/);
});

test("los ocho eventos comerciales quedan conectados a la infraestructura existente", () => {
  const analytics = source("lib/analytics/commerce-events.ts");
  const recommendations = source("components/wholesale/WholesaleRecommendations.tsx");
  for (const event of [
    "wholesale_progress_seen",
    "wholesale_progress_clicked",
    "wholesale_threshold_reached",
    "wholesale_price_applied",
    "wholesale_recommendation_clicked",
    "portal_negocios_opened",
    "pedido_rapido_opened",
    "business_account_requested",
  ]) assert.match(analytics, new RegExp(event));
  assert.match(recommendations, /wholesale_recommendation_clicked/);
  assert.match(source("app/api/wholesale/recommendations/route.ts"), /targetPrice \* 0\.55/);
});
