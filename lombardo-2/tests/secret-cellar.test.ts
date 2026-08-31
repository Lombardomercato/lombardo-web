import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { generateSecretCellarChallenge } from "../lib/secret-cellar/generator.ts";
import {
  selectActiveBottle,
  toggleDiscardedBottle,
} from "../lib/secret-cellar/game-state.ts";
import {
  formatSecretCellarCountdown,
  millisecondsUntilNextSecretCellarChallenge,
} from "../lib/secret-cellar/countdown.ts";
import type { Product } from "../types/commerce.ts";

function product(index: number, overrides: Partial<Product> = {}): Product {
  const id = `a${String(index).padStart(7, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const name = index % 3 === 0
    ? `BODEGA ${index} Malbec Reserva x 750 ml`
    : `BODEGA ${index} Cabernet x 750 ml`;
  return {
    id,
    sourceProductId: id,
    sku: `CZ${String(index).padStart(3, "0")}B`,
    slug: `bodega-${index}--${id}`,
    name,
    description: "",
    presentation: "750 ml",
    brand: { id: `brand-${index}`, slug: `bodega-${index}`, name: `BODEGA ${index}` },
    category: { id: "wine", slug: "vinos", name: "Vinos" },
    price: 10_000 + index * 1_000,
    basePrice: 10_000 + index * 1_000,
    priceType: "retail",
    pricingPolicy: "RETAIL",
    discountPercent: 0,
    pricingContextKey: "guest:RETAIL",
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images: [{ id: `image-${index}`, src: `https://example.com/${index}.jpg`, alt: name }],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
    ...overrides,
  };
}

const settings = {
  enabled: true,
  candidateCount: 10,
  clueCount: 5,
  rewardPercentage: 15,
  rewardValidHours: 48,
};

test("el desafío diario es determinista y comparte una única botella", () => {
  const input = {
    tenantId: "17c7fda1-0b07-47bd-8379-f0bd00fac1de",
    date: "2026-08-29",
    products: Array.from({ length: 24 }, (_, index) => product(index + 1)),
    excludedProductIds: new Set<string>(),
    settings,
    generatedBy: "DAILY_ENGINE" as const,
  };
  const first = generateSecretCellarChallenge(input);
  const second = generateSecretCellarChallenge(input);
  assert.equal(first.secretProductId, second.secretProductId);
  assert.deepEqual(first.candidates, second.candidates);
  assert.equal(first.candidates.length, 10);
  assert.equal(first.clues.length, 5);
  assert.ok(first.candidates.some((candidate) => candidate.id === first.secretProductId));
});

test("sólo participan botellas publicables, retail y no excluidas", () => {
  const blocked = product(90, { active: false });
  const costOnly = product(91, { basePrice: 0, price: 0 });
  const gourmet = product(92, { category: { id: "gourmet", slug: "gourmet", name: "Gourmet" } });
  const excluded = product(93);
  const challenge = generateSecretCellarChallenge({
    tenantId: "17c7fda1-0b07-47bd-8379-f0bd00fac1de",
    date: "2026-08-30",
    products: [
      ...Array.from({ length: 15 }, (_, index) => product(index + 1)),
      blocked,
      costOnly,
      gourmet,
      excluded,
    ],
    excludedProductIds: new Set([excluded.id]),
    settings,
    generatedBy: "ADMIN_NEXT_REGENERATION",
  });
  const ids = new Set(challenge.candidates.map((candidate) => candidate.id));
  assert.equal(ids.has(blocked.id), false);
  assert.equal(ids.has(costOnly.id), false);
  assert.equal(ids.has(gourmet.id), false);
  assert.equal(ids.has(excluded.id), false);
  assert.ok(challenge.candidates.every((candidate) => candidate.price > 0));
});

test("cada pista se deriva del snapshot real de la botella secreta", () => {
  const challenge = generateSecretCellarChallenge({
    tenantId: "17c7fda1-0b07-47bd-8379-f0bd00fac1de",
    date: "2026-08-31",
    products: Array.from({ length: 18 }, (_, index) => product(index + 1)),
    excludedProductIds: new Set<string>(),
    settings,
    generatedBy: "DAILY_ENGINE",
  });
  const secret = challenge.candidates.find((candidate) => candidate.id === challenge.secretProductId);
  assert.ok(secret);
  const combined = challenge.clues.map((clue) => clue.text).join(" ");
  assert.match(combined, new RegExp(secret.presentation, "i"));
  assert.match(combined, /precio retail/i);
  assert.match(combined, /familia de vinos/i);
  assert.equal(challenge.rewardPercentage, 15);
  assert.equal(challenge.rewardValidHours, 48);
});

test("falla cerrado si no hay entre 8 y 12 candidatos elegibles", () => {
  assert.throws(
    () => generateSecretCellarChallenge({
      tenantId: "17c7fda1-0b07-47bd-8379-f0bd00fac1de",
      date: "2026-09-01",
      products: Array.from({ length: 7 }, (_, index) => product(index + 1)),
      excludedProductIds: new Set<string>(),
      settings,
      generatedBy: "DAILY_ENGINE",
    }),
    /suficientes botellas SAFE/,
  );
});

test("el descarte no tiene límite y cada botella puede recuperarse", () => {
  let discarded = new Set<string>();
  for (const id of ["01", "02", "03", "04", "05", "06", "07", "08"]) {
    discarded = toggleDiscardedBottle(discarded, id);
  }
  assert.equal(discarded.size, 8);

  discarded = toggleDiscardedBottle(discarded, "02");
  discarded = toggleDiscardedBottle(discarded, "05");
  assert.equal(discarded.size, 6);
  assert.equal(discarded.has("02"), false);
  assert.equal(discarded.has("05"), false);
});

test("la respuesta final sólo acepta botellas activas y puede cambiar antes de confirmar", () => {
  const discarded = new Set(["03"]);
  let selected = selectActiveBottle(discarded, "01");
  assert.equal(selected, "01");
  selected = selectActiveBottle(discarded, "02");
  assert.equal(selected, "02");
  assert.equal(selectActiveBottle(discarded, "03"), "");
});

test("challenge, intentos y RPC quedan server-only con RLS forzado", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260829051314_hito4_secret_cellar.sql", import.meta.url),
    "utf8",
  );
  for (const table of [
    "secret_cellar_settings",
    "secret_cellar_exclusions",
    "secret_cellar_challenges",
    "secret_cellar_attempts",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${table} force row level security`, "i"));
  }
  assert.match(
    migration,
    /revoke all on function public\.lombardo_submit_secret_cellar_attempt[\s\S]*from public, anon, authenticated/i,
  );
  assert.match(
    migration,
    /grant execute on function public\.lombardo_submit_secret_cellar_attempt[\s\S]*to service_role/i,
  );
  assert.doesNotMatch(migration, /grant\s+(select|insert|update|delete)[^;]*to\s+(anon|authenticated)/i);
});

test("el acierto crea un cupón estándar del Promotion Engine, no un descuento paralelo", async () => {
  const migration = await readFile(
    new URL("../supabase/migrations/20260829051314_hito4_secret_cellar.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /insert into public\.commerce_promotions/i);
  assert.match(migration, /'ACTIVE', 'PERCENTAGE', v_challenge\.reward_percentage/i);
  assert.match(migration, /0, 1, 1, 'ALL', 'RETAIL', false, false/i);
  assert.match(migration, /'CAVA-' \|\| upper/i);
  assert.doesNotMatch(migration, /alter table public\.commerce_orders[\s\S]*secret_cellar/i);
});

test("la cuenta regresiva representa el cambio real de día en Argentina", () => {
  const twoSecondsBeforeMidnight = new Date("2026-08-29T23:59:58-03:00").getTime();
  assert.equal(millisecondsUntilNextSecretCellarChallenge(twoSecondsBeforeMidnight), 2_000);
  assert.equal(formatSecretCellarCountdown(3_661_000), "01 : 01 : 01");
});

test("la experiencia física conserva alternativas accesibles y la mecánica aprobada", async () => {
  const [component, stylesheet] = await Promise.all([
    readFile(new URL("../components/secret-cellar/SecretCellarGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/secret-cellar/SecretCellarGame.module.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /Todos los días Lombardo esconde una botella/);
  assert.match(component, /% OFF HOY/);
  assert.match(component, /ABRIR LA CAVA/);
  assert.match(component, /styles\.cellarPlaque/);
  assert.match(component, /LOMBARDO · CAVA 04/);
  assert.match(stylesheet, /secret-cellar-doors-v3\.webp/);
  assert.match(component, /CELLAR_OPEN_DURATION_MS = 1_350/);
  assert.match(component, /onPointerMove/);
  assert.match(stylesheet, /touch-action: none/);
  assert.match(component, /ArrowRight/);
  assert.match(component, /event\.key === "Enter"/);
  assert.match(component, /ChallengeCountdown compact/);
  assert.match(component, /setRevealing\(true\)/);
  assert.match(component, /2_050/);
  assert.match(component, /prefers-reduced-motion: reduce/);
  assert.match(component, /LA ENCONTRASTE\./);
  assert.match(component, /ESTA ERA LA BOTELLA ESCONDIDA\./);
  assert.match(component, /CERRANDO LA CAVA…/);
  assert.match(component, /REVELANDO LA BOTELLA…/);
  assert.match(stylesheet, /\.revealTransition/);
  assert.match(stylesheet, /\.finalDoorLeft/);
  assert.match(stylesheet, /rotateY\(calc\(var\(--open-progress\) \* -94deg\)\)/);
  assert.match(stylesheet, /@keyframes enter-cellar-threshold/);
  assert.match(stylesheet, /@keyframes bottle-awaken/);
  assert.match(stylesheet, /@keyframes cellar-light-wash/);
  assert.match(stylesheet, /\.candidate\[data-discarded="true"\][\s\S]*--discard-depth/);
  assert.match(stylesheet, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.revealTransition[\s\S]*animation: none/);
  assert.doesNotMatch(`${component}\n${stylesheet}`, /confetti|ne[oó]n|casino|roulette|audio|sound|glow/i);
});
