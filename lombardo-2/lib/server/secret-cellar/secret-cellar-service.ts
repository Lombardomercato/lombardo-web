import "server-only";

import { createHash } from "node:crypto";

import { commerceProvider } from "@/lib/commerce";
import { generateSecretCellarChallenge } from "@/lib/secret-cellar/generator";
import type {
  SecretCellarAdminDashboard,
  SecretCellarAttemptResult,
  SecretCellarPublicExperience,
  SecretCellarSettings,
} from "@/lib/secret-cellar/types";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { retailPricingContext } from "@/lib/server/customers/types";
import { readRuniaConfiguration } from "@/lib/server/environment";
import { SecretCellarStore } from "./secret-cellar-store";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class SecretCellarInputError extends Error {
  constructor(
    message: string,
    readonly status = 422,
  ) {
    super(message);
  }
}

function argentinaDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeGuestContact(kind: "EMAIL" | "WHATSAPP", raw: string) {
  if (kind === "EMAIL") {
    const value = raw.trim().toLocaleLowerCase("en-US").slice(0, 254);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      throw new SecretCellarInputError("Ingresá un email válido para recibir el premio.");
    }
    const [local, domain] = value.split("@");
    return {
      value,
      masked: `${local.slice(0, 1)}${"*".repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`,
    };
  }

  const digits = raw.replace(/\D/g, "").slice(0, 16);
  if (digits.length < 8) {
    throw new SecretCellarInputError("Ingresá un WhatsApp válido para recibir el premio.");
  }
  return { value: digits, masked: `WHATSAPP · ***${digits.slice(-4)}` };
}

export class SecretCellarService {
  private readonly store: SecretCellarStore;
  private readonly tenantSlug: string;

  constructor(options?: {
    store?: SecretCellarStore;
    tenantSlug?: string;
  }) {
    if (options?.store && options.tenantSlug) {
      this.tenantSlug = options.tenantSlug;
      this.store = options.store;
      return;
    }
    const configuration = readRuniaConfiguration();
    this.tenantSlug = options?.tenantSlug ?? configuration.tenantSlug;
    this.store = options?.store ?? new SecretCellarStore({
      url: configuration.url,
      secretKey: configuration.secretKey,
      tenantSlug: configuration.tenantSlug,
    });
  }

  private async loadEligibleProducts(date: string) {
    const context = retailPricingContext(this.tenantSlug);
    const first = await commerceProvider.getProductPage({ offset: 0, limit: 48 }, context);
    const pageCount = Math.max(1, Math.ceil(first.total / 48));
    const start = Number.parseInt(
      createHash("sha256").update(`${this.tenantSlug}:${date}:catalog-window`).digest("hex").slice(0, 8),
      16,
    ) % pageCount;
    const offsets = [0, ...Array.from({ length: 5 }, (_, index) => ((start + index) % pageCount) * 48)];
    const pages = await Promise.all(
      offsets.slice(1).map((offset) =>
        commerceProvider.getProductPage(
          { offset, limit: 48 },
          context,
        ),
      ),
    );
    return [...new Map(
      [first, ...pages].flatMap((page) => page.products).map((product) => [product.id, product]),
    ).values()];
  }

  private async generate(date: string, generatedBy: "DAILY_ENGINE" | "ADMIN_NEXT_REGENERATION") {
    const [tenantId, settings, configuredExclusions, recentProducts, products] = await Promise.all([
      this.store.tenantId(),
      this.store.getSettings(),
      this.store.exclusionIds(),
      this.store.recentChallengeProductIds(date),
      this.loadEligibleProducts(date),
    ]);
    const excludedProductIds = new Set([...configuredExclusions, ...recentProducts]);
    const challenge = generateSecretCellarChallenge({
      tenantId,
      date,
      products,
      excludedProductIds,
      settings,
      generatedBy,
    });
    const created = await this.store.createChallenge(challenge);
    if (!created) throw new Error("Runia no devolvió el desafío creado.");
    return created;
  }

  async ensureChallenge(date = argentinaDate()) {
    return (await this.store.getChallenge(date)) ?? this.generate(date, "DAILY_ENGINE");
  }

  async ensureChallengeWithFallback(date = argentinaDate()) {
    const existing = await this.store.getChallenge(date);
    if (existing) return { challenge: existing, fallback: existing.generatedBy === "DAILY_FALLBACK" };
    try {
      return { challenge: await this.generate(date, "DAILY_ENGINE"), fallback: false };
    } catch (generationError) {
      const fallback = await this.store.cloneLatestChallenge(date);
      if (!fallback) throw generationError;
      return { challenge: fallback, fallback: true };
    }
  }

  async getPublicExperience(): Promise<SecretCellarPublicExperience> {
    const settings = await this.store.getSettings();
    if (!settings.enabled) return { enabled: false };
    const [challenge, pricingContext] = await Promise.all([
      this.ensureChallengeWithFallback().then((result) => result.challenge),
      getCurrentCustomerPricingContext(),
    ]);
    return {
      enabled: true,
      challenge: {
        id: challenge.id,
        date: challenge.date,
        candidates: challenge.candidates,
        clues: challenge.clues,
        rewardPercentage: challenge.rewardPercentage,
        rewardValidHours: challenge.rewardValidHours,
        playerIsAuthenticated: Boolean(pricingContext.customerAccountId),
      },
    };
  }

  async isEnabled() {
    return (await this.store.getSettings()).enabled;
  }

  async submitAttempt(input: {
    challengeId: string;
    selectedProductId: string;
    guestContactKind?: "EMAIL" | "WHATSAPP";
    guestContact?: string;
  }): Promise<SecretCellarAttemptResult> {
    if (!UUID_PATTERN.test(input.challengeId) || !UUID_PATTERN.test(input.selectedProductId)) {
      throw new SecretCellarInputError("La selección no es válida.");
    }
    const [settings, pricingContext] = await Promise.all([
      this.store.getSettings(),
      getCurrentCustomerPricingContext(),
    ]);
    if (!settings.enabled) throw new SecretCellarInputError("La cava está cerrada por hoy.", 409);

    let playerKey: string;
    let guestContactHash: string | undefined;
    let guestContactMasked: string | undefined;
    if (pricingContext.customerAccountId) {
      playerKey = `account:${pricingContext.customerAccountId}`;
    } else {
      if (
        (input.guestContactKind !== "EMAIL" && input.guestContactKind !== "WHATSAPP") ||
        !input.guestContact
      ) {
        throw new SecretCellarInputError("Dejanos un email o WhatsApp antes de abrir el premio.");
      }
      const contact = normalizeGuestContact(input.guestContactKind, input.guestContact);
      const tenantId = await this.store.tenantId();
      guestContactHash = createHash("sha256")
        .update(`${tenantId}:${input.guestContactKind}:${contact.value}`)
        .digest("hex");
      guestContactMasked = contact.masked;
      playerKey = `guest:${guestContactHash}`;
    }

    const result = await this.store.submitAttempt({
      challengeId: input.challengeId,
      selectedProductId: input.selectedProductId,
      playerKey,
      customerAccountId: pricingContext.customerAccountId,
      guestContactKind: pricingContext.customerAccountId ? undefined : input.guestContactKind,
      guestContactHash,
      guestContactMasked,
    });
    const challenge = await this.store.getChallengeById(input.challengeId);
    const secret = challenge?.candidates.find(
      (candidate) => candidate.id === challenge.secretProductId,
    );
    if (!challenge || challenge.date !== argentinaDate() || !secret) {
      throw new SecretCellarInputError("La cava ya cambió de desafío.", 409);
    }
    return { ...result, secret };
  }

  async regenerateNextChallenge() {
    const nextDate = addDays(argentinaDate(), 1);
    await this.store.deleteScheduledChallenge(nextDate);
    return this.generate(nextDate, "ADMIN_NEXT_REGENERATION");
  }

  async updateSettings(settings: SecretCellarSettings, operatorId: string) {
    if (
      settings.candidateCount < 8 || settings.candidateCount > 12 ||
      settings.clueCount < 4 || settings.clueCount > 5 ||
      settings.rewardPercentage <= 0 || settings.rewardPercentage >= 100 ||
      settings.rewardValidHours < 1 || settings.rewardValidHours > 168
    ) {
      throw new SecretCellarInputError("La configuración de la cava no es coherente.");
    }
    await this.store.updateSettings(settings, operatorId);
  }

  async addExclusion(productId: string, reason: string, operatorId: string) {
    if (!UUID_PATTERN.test(productId)) throw new SecretCellarInputError("El producto no es válido.");
    await this.store.addExclusion(productId, reason.trim().slice(0, 500), operatorId);
  }

  async removeExclusion(productId: string) {
    if (!UUID_PATTERN.test(productId)) throw new SecretCellarInputError("El producto no es válido.");
    await this.store.removeExclusion(productId);
  }

  async getAdminDashboard(): Promise<SecretCellarAdminDashboard> {
    const today = argentinaDate();
    const tomorrow = addDays(today, 1);
    const settings = await this.store.getSettings();
    const current = (await this.store.getChallenge(today)) ??
      (settings.enabled ? await this.generate(today, "DAILY_ENGINE") : undefined);
    const [next, exclusions, attempts] = await Promise.all([
      this.store.getChallenge(tomorrow),
      this.store.listExclusions(),
      current ? this.store.listAttempts(current.id) : Promise.resolve([]),
    ]);
    const promotions = attempts.flatMap((attempt) => attempt.promotionId ? [attempt.promotionId] : []);
    const converted = await this.store.countConsumedPromotions(promotions);
    const found = attempts.filter((attempt) => attempt.result === "FOUND").length;
    return {
      settings,
      current,
      next: next ?? undefined,
      attempts,
      exclusions,
      participants: attempts.length,
      found,
      missed: attempts.length - found,
      couponsIssued: promotions.length,
      converted,
    };
  }
}

export function createSecretCellarService() {
  return new SecretCellarService();
}
