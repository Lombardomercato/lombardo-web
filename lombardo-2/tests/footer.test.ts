import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const component = readFileSync("components/layout/Footer.tsx", "utf8");
const stylesheet = readFileSync("components/layout/Footer.module.css", "utf8");

test("el zócalo reutiliza la marca Lombardo con trademark y elimina las flechas", () => {
  assert.match(component, /LOMBARDO[\s\S]*styles\.trademark[\s\S]*™/);
  assert.match(stylesheet, /font-size:\s*clamp\(0\.22rem, 0\.28vw, 0\.3rem\)/);
  assert.doesNotMatch(component, /↗/);
  assert.match(component, /function WhatsAppIcon/);
  assert.match(component, /function InstagramIcon/);
});

test("el slogan final expresa la propuesta de Lombardo", () => {
  assert.match(component, /LOMBARDO \| Tu vinería, donde estés\./);
});

test("el cierre legal acredita a Runia Web y reserva los derechos", () => {
  assert.match(component, /Todos los derechos reservados/);
  assert.match(component, /Developed by/);
  assert.match(component, /https:\/\/web\.runia\.ar\//);
});

test("el zócalo mantiene una escala fina y compacta también en mobile", () => {
  assert.match(stylesheet, /font-size:\s*clamp\(1\.35rem, 2vw, 1\.8rem\)/);
  assert.match(stylesheet, /font-size:\s*0\.68rem/);
  assert.match(stylesheet, /font-size:\s*0\.55rem/);
  assert.match(stylesheet, /@media \(max-width: 47\.99rem\)/);
  assert.doesNotMatch(stylesheet, /min-height:\s*2[06]rem/);
});
