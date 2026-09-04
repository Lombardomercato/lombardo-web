import { createHash } from "node:crypto";

import { ARGENTINA_TIME_ZONE } from "../automations/date.ts";
import type { Product } from "@/types/commerce";
import type {
  SecretCellarCandidate,
  SecretCellarChallenge,
  SecretCellarClue,
  SecretCellarSettings,
} from "./types";

const BOTTLE_CATEGORIES = new Set(["vinos", "destilados"]);
const NAME_TOKENS = [
  "MALBEC",
  "CABERNET",
  "CHARDONNAY",
  "PINOT",
  "SYRAH",
  "MERLOT",
  "TORRONTES",
  "BONARDA",
  "SAUVIGNON",
  "BLEND",
  "ROSE",
] as const;

function normalized(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleUpperCase("es-AR");
}

function deterministicScore(seed: string, id: string) {
  return createHash("sha256").update(`${seed}:${id}`).digest("hex");
}

function ranked<T extends { id: string }>(items: T[], seed: string) {
  return [...items].sort((left, right) =>
    deterministicScore(seed, left.id).localeCompare(
      deterministicScore(seed, right.id),
    ),
  );
}

function candidateFromProduct(product: Product): SecretCellarCandidate {
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    brand: product.brand.name,
    categorySlug: product.category.slug,
    categoryName: product.category.name,
    presentation: product.presentation,
    price: product.basePrice,
    imageUrl: product.images[0]?.src ?? "",
  };
}

function priceClue(secret: SecretCellarCandidate): SecretCellarClue {
  const threshold = Math.floor(secret.price / 5_000) * 5_000 + 5_000;
  return {
    id: "price",
    source: "PRICE",
    productId: secret.id,
    text: `Mi precio retail de hoy no llega a $${threshold.toLocaleString("es-AR")}.`,
  };
}

function tokenClue(
  secret: SecretCellarCandidate,
  candidates: SecretCellarCandidate[],
): SecretCellarClue | null {
  const secretName = normalized(secret.name);
  const present = NAME_TOKENS.find((token) => secretName.includes(token));
  if (present) {
    return {
      id: "name-token",
      source: "NAME_TOKEN",
      productId: secret.id,
      text: `En mi nombre aparece “${present}”.`,
    };
  }

  const absent = NAME_TOKENS.map((token) => ({
    token,
    count: candidates.filter((candidate) => normalized(candidate.name).includes(token))
      .length,
  }))
    .filter((entry) => entry.count >= 2)
    .sort((left, right) => right.count - left.count)[0]?.token;
  return absent
    ? {
        id: "name-token",
        source: "NAME_TOKEN",
        productId: secret.id,
        text: `En mi nombre no aparece “${absent}”.`,
      }
    : null;
}

function cluesFor(
  secret: SecretCellarCandidate,
  candidates: SecretCellarCandidate[],
  count: number,
) {
  const brandInitial = normalized(secret.brand).match(/[A-Z0-9]/)?.[0] ?? "L";
  const nameInitial = normalized(secret.name).match(/[A-Z0-9]/)?.[0] ?? "L";
  const clues: SecretCellarClue[] = [
    {
      id: "category",
      source: "CATEGORY",
      productId: secret.id,
      text: `Estoy en la familia de ${secret.categoryName.toLocaleLowerCase("es-AR")}.`,
    },
    priceClue(secret),
    {
      id: "presentation",
      source: "PRESENTATION",
      productId: secret.id,
      text: `Mi presentación registrada es ${secret.presentation}.`,
    },
  ];
  const nameToken = tokenClue(secret, candidates);
  if (nameToken) clues.push(nameToken);
  clues.push({
    id: "brand-initial",
    source: "BRAND_INITIAL",
    productId: secret.id,
    text: `Mi marca empieza con “${brandInitial}”.`,
  });
  if (clues.length < count) {
    clues.push({
      id: "name-initial",
      source: "NAME_INITIAL",
      productId: secret.id,
      text: `Mi nombre empieza con “${nameInitial}”.`,
    });
  }
  return clues.slice(0, count);
}

export function generateSecretCellarChallenge(input: {
  id?: string;
  tenantId: string;
  date: string;
  products: Product[];
  excludedProductIds: Set<string>;
  blockedSecretProductIds?: ReadonlySet<string>;
  settings: SecretCellarSettings;
  generatedBy: SecretCellarChallenge["generatedBy"];
  createdAt?: string;
  currentDate?: string;
}): Omit<SecretCellarChallenge, "id"> & { id?: string } {
  const eligible = input.products.filter(
    (product) =>
      product.active &&
      product.basePrice > 0 &&
      product.images.length > 0 &&
      BOTTLE_CATEGORIES.has(product.category.slug) &&
      !input.excludedProductIds.has(product.id),
  );
  if (eligible.length < input.settings.candidateCount) {
    throw new Error("No hay suficientes botellas SAFE para crear el desafío diario.");
  }

  const seed = `${input.tenantId}:${input.date}`;
  const secretPool = eligible.filter(
    (product) => !input.blockedSecretProductIds?.has(product.id),
  );
  const secretProduct = ranked(
    secretPool.length ? secretPool : eligible,
    `${seed}:secret`,
  )[0];
  const coherentPool = eligible.filter(
    (product) =>
      product.id !== secretProduct.id &&
      product.category.slug === secretProduct.category.slug,
  );
  const remainderPool = eligible.filter(
    (product) =>
      product.id !== secretProduct.id &&
      product.category.slug !== secretProduct.category.slug,
  );
  const coherent = ranked(coherentPool, `${seed}:coherent`);
  const remainder = ranked(remainderPool, `${seed}:remainder`);
  const selected = [
    secretProduct,
    ...coherent,
    ...remainder,
  ].slice(0, input.settings.candidateCount);
  const candidates = ranked(
    selected.map(candidateFromProduct),
    `${seed}:display`,
  );
  const secret = candidateFromProduct(secretProduct);
  const todayParts = new Intl.DateTimeFormat("en-US", {
    timeZone: ARGENTINA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const todayValue = Object.fromEntries(
    todayParts.map((part) => [part.type, part.value]),
  );
  const today = input.currentDate ?? `${todayValue.year}-${todayValue.month}-${todayValue.day}`;

  return {
    id: input.id,
    tenantId: input.tenantId,
    date: input.date,
    status: input.date === today ? "ACTIVE" : "SCHEDULED",
    secretProductId: secret.id,
    candidates,
    clues: cluesFor(secret, candidates, input.settings.clueCount),
    rewardPercentage: input.settings.rewardPercentage,
    rewardValidHours: input.settings.rewardValidHours,
    generatedBy: input.generatedBy,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
