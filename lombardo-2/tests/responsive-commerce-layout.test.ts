import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const headerCss = readFileSync("components/layout/Header.module.css", "utf8");
const catalogCss = readFileSync("components/catalog/CatalogExplorer.module.css", "utf8");
const opportunitiesCss = readFileSync("components/opportunities/OpportunityGrid.module.css", "utf8");
const baseCss = readFileSync("styles/base.css", "utf8");

test("el menú mobile tiene una superficie propia a pantalla completa", () => {
  assert.match(headerCss, /\.mobilePanel\s*\{[\s\S]*position:\s*absolute/);
  assert.match(headerCss, /height:\s*calc\(100svh - var\(--header-height-mobile\)\)/);
  assert.match(headerCss, /background:\s*var\(--lombardo-blue\)/);
  assert.match(headerCss, /\.mobileIntro\s*\{/);
});

test("el precio editorial pertenece al flujo de la tarjeta", () => {
  assert.match(catalogCss, /\.editorialGrid \.productInfo\s*\{[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(catalogCss, /\.editorialGrid \.priceBlock\s*\{[\s\S]*justify-items:\s*start/);
});

test("Oportunidades evita cinco columnas frágiles y colapsa a una en mobile", () => {
  assert.match(opportunitiesCss, /grid-template-columns:\s*repeat\(12, minmax\(0, 1fr\)\)/);
  assert.match(opportunitiesCss, /\.card\s*\{[\s\S]*grid-column:\s*span 4/);
  assert.match(opportunitiesCss, /\.visual > div\s*\{[\s\S]*height:\s*clamp\(17rem, 25vw, 24rem\)/);
  assert.match(opportunitiesCss, /@media \(max-width: 720px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(opportunitiesCss, /overflow-wrap:\s*anywhere/);
});

test("la raíz impide scroll horizontal accidental", () => {
  assert.match(baseCss, /html\s*\{[\s\S]*overflow-x:\s*clip/);
  assert.match(baseCss, /\.site-content\s*\{[\s\S]*overflow-x:\s*clip/);
});
