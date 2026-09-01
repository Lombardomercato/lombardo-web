"use server";

import { headers } from "next/headers";
import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticateAdminCredentials,
  createAdminStore,
  requireAdminRole,
  requireAdminSession,
  revokeAdminSession,
} from "@/lib/server/admin/admin-auth";
import { AdminStoreError } from "@/lib/server/admin/runia-admin-store";
import type { FulfillmentStatus } from "@/lib/server/admin/types";
import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  createCustomerOrderConfirmationNotifier,
  createNewOrderNotifier,
  createOrderServices,
} from "@/lib/server/services";
import { parseCreateOrderInput } from "@/lib/server/orders/order-input";
import { ServerOrderError } from "@/lib/server/orders/server-order-error";
import {
  AdminAssistedOrderError,
  adminAssistedManagementMatches,
  buildAdminAssistedManagement,
  hasAdminManualPrices,
  parseAdminAssistedOrderItems,
} from "@/lib/server/orders/admin-assisted-order";
import {
  createCustomerWithInvite,
  updateCustomer,
} from "@/lib/server/customers/customer-admin";
import {
  CustomerAdminValidationError,
  parseAdminCustomerInput,
} from "@/lib/server/customers/customer-admin-validation";
import {
  parseAdminPromotionInput,
  PromotionAdminValidationError,
} from "@/lib/server/promotions/promotion-admin-validation";
import {
  createSecretCellarService,
  SecretCellarInputError,
} from "@/lib/server/secret-cellar/secret-cellar-service";
import { SecretCellarStoreError } from "@/lib/server/secret-cellar/secret-cellar-store";
import { AUTOMATION_TYPES, type AutomationType } from "@/lib/automations/types";
import { minuteRunKey } from "@/lib/automations/date";
import { createAutomationServices } from "@/lib/server/automations";
import { AutomationStoreError } from "@/lib/server/automations/automation-store";
import { createCompetitorServices } from "@/lib/server/competitors";
import { CompetitorStoreError } from "@/lib/server/competitors/competitor-store";
import { COMPETITOR_ALERT_TYPES, type CompetitorAlertType } from "@/lib/competitors/types";
import { createPricingIntelligenceServices } from "@/lib/server/pricing-intelligence";
import { PricingIntelligenceStoreError } from "@/lib/server/pricing-intelligence/pricing-store";
import {
  AdminOrderValidationError,
  buildAdminOrderManagementInput,
  parseAdminOrderPayload,
} from "@/lib/server/orders/admin-order-validation";
import {
  COMMERCIAL_SENSITIVITIES,
  type CommercialSensitivity,
  type PricingIntelligenceSettings,
} from "@/lib/pricing-intelligence/types";

export interface AdminLoginState {
  error?: string;
}

export interface AdminCreateOrderState {
  status: "idle" | "error" | "success";
  message: string;
  publicId?: string;
}

const FULFILLMENT_STATUSES: readonly FulfillmentStatus[] = [
  "new",
  "confirmed",
  "preparing",
  "ready",
  "delivered",
  "cancelled",
];

function formText(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function formRaw(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function candidateIds(formData: FormData) {
  return [...new Set(formData.getAll("candidateIds"))]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter((value) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))
    .slice(0, 25);
}

async function settleInBatches<T>(items: T[], batchSize: number, operation: (item: T) => Promise<void>) {
  const results: PromiseSettledResult<void>[] = [];
  for (let index = 0; index < items.length; index += batchSize) {
    results.push(...await Promise.allSettled(items.slice(index, index + batchSize).map(operation)));
  }
  return results;
}

function validStatus(value: string): value is FulfillmentStatus {
  return FULFILLMENT_STATUSES.includes(value as FulfillmentStatus);
}

function validAutomationType(value: string): value is AutomationType {
  return AUTOMATION_TYPES.includes(value as AutomationType);
}

function formNumber(formData: FormData, name: string) {
  const raw = formText(formData, name, 32).replace(",", ".");
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new PricingIntelligenceStoreError("La información de precio no es válida.", 422);
  }
  return value;
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function formReviewAt(formData: FormData) {
  const raw = formText(formData, "reviewAt", 64);
  const reviewAt = new Date(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw) ? `${raw}:00-03:00` : raw);
  if (!Number.isFinite(reviewAt.getTime())) {
    throw new PricingIntelligenceStoreError("La fecha de revisión no es válida.", 422);
  }
  return reviewAt;
}

export async function runAutomationAction(formData: FormData) {
  let destination = "/admin/automatizaciones";
  const type = formText(formData, "automationType", 40);
  try {
    const session = await requireAdminRole("admin");
    if (!validAutomationType(type)) throw new AutomationStoreError("Automatización inválida.", 400);
    const result = await createAutomationServices().orchestrator.run({
      type,
      trigger: "manual",
      runKey: minuteRunKey(type),
      createdBy: session.authUserId,
    });
    revalidatePath("/");
    revalidatePath("/guias");
    revalidatePath("/admin/automatizaciones");
    destination += result.claimed
      ? `?success=${encodeURIComponent(`${type}: ${result.status}.`)}`
      : `?success=${encodeURIComponent(`${type}: ya estaba ejecutado o en curso.`)}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof AutomationStoreError ? error.message : "No pudimos ejecutar la automatización.")}`;
  }
  redirect(destination);
}

export async function pinHomeFeaturedAction(formData: FormData) {
  let destination = "/admin/automatizaciones";
  try {
    const session = await requireAdminRole("admin");
    const sku = formText(formData, "sku", 80).toLocaleUpperCase("es-AR");
    const position = Math.min(Math.max((Number(formText(formData, "position", 2)) || 1) - 1, 0), 5);
    if (!sku) throw new AutomationStoreError("Ingresá un SKU SAFE.", 422);
    await createAutomationServices().store.pinProductBySku(sku, position, session.authUserId);
    revalidatePath("/admin/automatizaciones");
    destination += `?success=${encodeURIComponent("Producto fijado. Se aplicará en la próxima rotación.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof AutomationStoreError ? error.message : "No pudimos fijar el producto.")}`;
  }
  redirect(destination);
}

export async function unpinHomeFeaturedAction(formData: FormData) {
  let destination = "/admin/automatizaciones";
  try {
    await requireAdminRole("admin");
    const pinId = formText(formData, "pinId", 36);
    if (!/^[0-9a-f-]{36}$/i.test(pinId)) throw new AutomationStoreError("PIN inválido.", 400);
    await createAutomationServices().store.unpinProduct(pinId);
    revalidatePath("/admin/automatizaciones");
    destination += `?success=${encodeURIComponent("PIN removido.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof AutomationStoreError ? error.message : "No pudimos quitar el PIN.")}`;
  }
  redirect(destination);
}

export async function runCompetitorIngestionAction() {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const result = await createCompetitorServices().service.run({
      trigger: "manual",
      runKey: minuteRunKey("competitor-positano"),
      createdBy: session.authUserId,
    });
    revalidatePath(destination);
    const feedback = `Positano: ${result.status} · ${result.productsParsed} productos · ${result.matched} matches.`;
    destination += result.status === "failed" || result.status === "blocked"
      ? `?error=${encodeURIComponent(`${feedback} ${result.warnings.join(" ")}`)}`
      : `?success=${encodeURIComponent(feedback)}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof CompetitorStoreError ? error.message : "No pudimos ejecutar Competencia.")}`;
  }
  redirect(destination);
}

export async function setCompetitorMatchAction(formData: FormData) {
  const productId = formText(formData, "competitorProductId", 36);
  let destination = `/admin/competencia/${productId}`;
  try {
    const session = await requireAdminRole("admin");
    if (!/^[0-9a-f-]{36}$/i.test(productId)) throw new CompetitorStoreError("Producto inválido.", 400);
    const rejected = formData.get("matchAction") === "reject";
    const runiaSku = formText(formData, "runiaSku", 80).toLocaleUpperCase("es-AR");
    if (!rejected && !runiaSku) throw new CompetitorStoreError("Ingresá un SKU Runia SAFE.", 422);
    await createCompetitorServices().store.setManualMatch({
      competitorProductId: productId,
      runiaSku,
      rejected,
      operatorId: session.authUserId,
    });
    revalidatePath("/admin/competencia");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent(rejected ? "Match rechazado manualmente." : "Match corregido manualmente.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof CompetitorStoreError ? error.message : "No pudimos guardar el match.")}`;
  }
  redirect(destination);
}

function alertRuleValue(formData: FormData, type: CompetitorAlertType, field: "threshold" | "cooldown") {
  const value = Number(formText(formData, `${field}_${type}`, 10));
  if (!Number.isFinite(value)) throw new CompetitorStoreError("La configuración de alertas no es válida.", 422);
  return field === "threshold"
    ? Math.min(Math.max(value, 0), 1_000)
    : Math.min(Math.max(Math.trunc(value), 1), 8_760);
}

export async function updateCompetitorAlertRulesAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    await requireAdminRole("admin");
    const services = createCompetitorServices();
    const competitor = await services.store.ensurePositano();
    await services.store.updateRules(competitor.id, COMPETITOR_ALERT_TYPES.map((type) => ({
      type,
      enabled: formData.get(`enabled_${type}`) === "on",
      thresholdPct: alertRuleValue(formData, type, "threshold"),
      cooldownHours: alertRuleValue(formData, type, "cooldown"),
    })));
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Alertas competitivas actualizadas.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof CompetitorStoreError ? error.message : "No pudimos actualizar las alertas.")}`;
  }
  redirect(destination);
}

export async function setCommercialSensitivityAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const productId = formText(formData, "runiaProductId", 36);
    const competitorProductId = formText(formData, "competitorProductId", 36);
    const sensitivity = formText(formData, "sensitivity", 40);
    if (!isUuid(productId) || !isUuid(competitorProductId)) {
      throw new PricingIntelligenceStoreError("El producto no es válido.", 400);
    }
    if (!COMMERCIAL_SENSITIVITIES.includes(sensitivity as CommercialSensitivity)) {
      throw new PricingIntelligenceStoreError("La sensibilidad comercial no es válida.", 422);
    }
    await createPricingIntelligenceServices().store.setSensitivity(
      productId,
      sensitivity as CommercialSensitivity,
      session.authUserId,
    );
    revalidatePath("/admin/competencia");
    revalidatePath(`/admin/competencia/${competitorProductId}`);
    destination += `?success=${encodeURIComponent("Sensibilidad comercial actualizada.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos actualizar la sensibilidad.")}`;
  }
  redirect(destination);
}

export async function updatePricingIntelligenceSettingsAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const settings: PricingIntelligenceSettings = {
      veryCompetitiveMaxPct: formNumber(formData, "veryCompetitiveMaxPct"),
      competitiveMaxPct: formNumber(formData, "competitiveMaxPct"),
      marketMaxPct: formNumber(formData, "marketMaxPct"),
      expensiveMaxPct: formNumber(formData, "expensiveMaxPct"),
      minimumMarginPct: formNumber(formData, "minimumMarginPct"),
      targetMarginPct: formNumber(formData, "targetMarginPct"),
      competitorMaxAgeHours: Math.trunc(formNumber(formData, "competitorMaxAgeHours")),
    };
    if (!(
      settings.veryCompetitiveMaxPct < settings.competitiveMaxPct &&
      settings.competitiveMaxPct < settings.marketMaxPct &&
      settings.marketMaxPct < settings.expensiveMaxPct &&
      settings.minimumMarginPct >= 0 &&
      settings.targetMarginPct >= settings.minimumMarginPct &&
      settings.targetMarginPct < 100 &&
      settings.competitorMaxAgeHours >= 1
    )) {
      throw new PricingIntelligenceStoreError("Los umbrales no forman una configuración válida.", 422);
    }
    await createPricingIntelligenceServices().store.updateSettings(settings, session.authUserId);
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Umbrales y márgenes actualizados.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos actualizar Pricing Intelligence.")}`;
  }
  redirect(destination);
}

export async function ignorePricingOpportunityAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const competitorProductId = formText(formData, "competitorProductId", 36);
    if (!isUuid(competitorProductId)) {
      throw new PricingIntelligenceStoreError("La oportunidad no es válida.", 400);
    }
    await createPricingIntelligenceServices().store.ignoreOpportunity(
      competitorProductId,
      session.authUserId,
      formText(formData, "note", 300),
    );
    revalidatePath(destination);
    revalidatePath(`/admin/competencia/${competitorProductId}`);
    destination += `?success=${encodeURIComponent("Oportunidad ignorada; no se modificó ningún precio.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos ignorar la oportunidad.")}`;
  }
  redirect(destination);
}

export async function applyLombardoSellingPriceAction(formData: FormData) {
  const competitorProductId = formText(formData, "competitorProductId", 36);
  let destination = isUuid(competitorProductId)
    ? `/admin/competencia/${competitorProductId}`
    : "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const productId = formText(formData, "runiaProductId", 36);
    const reason = formText(formData, "reason", 40);
    const source = formText(formData, "approvalSource", 40);
    const reasons = ["MANUAL", "COMPETITOR_REVIEW", "PROMOTION", "OTHER"] as const;
    if (!isUuid(productId) || !isUuid(competitorProductId)) {
      throw new PricingIntelligenceStoreError("El producto no es válido.", 400);
    }
    if (!reasons.includes(reason as (typeof reasons)[number])) {
      throw new PricingIntelligenceStoreError("Elegí un motivo válido.", 422);
    }
    if (source !== "ADMIN" && source !== "PRICING_INTELLIGENCE") {
      throw new PricingIntelligenceStoreError("La fuente de aprobación no es válida.", 422);
    }
    const result = await createPricingIntelligenceServices().store.setSellingPrice({
      productId,
      newPrice: formNumber(formData, "newPrice"),
      reason: reason as (typeof reasons)[number],
      source,
      approvedBy: session.authUserId,
      expectedCurrentPrice: formNumber(formData, "expectedCurrentPrice"),
      expectedVersion: Math.trunc(formNumber(formData, "expectedVersion")),
      expectedSupplierCost: formNumber(formData, "expectedSupplierCost"),
      expectedCompetitorProductId: competitorProductId,
      expectedCompetitorPrice: formNumber(formData, "expectedCompetitorPrice"),
      expectedCompetitorFetchedAt: formText(formData, "expectedCompetitorFetchedAt", 64),
      allowAtOrBelowCost: formData.get("allowAtOrBelowCost") === "on",
    });
    revalidateTag("runia-real-catalog", "max");
    revalidatePath("/");
    revalidatePath("/admin/competencia");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent(result.changed ? "Precio Lombardo aprobado y auditado." : "El precio ya era el vigente; no hubo cambios.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos aplicar el precio Lombardo.")}`;
  }
  redirect(destination);
}

export async function publishLombardoOpportunityAction(formData: FormData) {
  const competitorProductId = formText(formData, "competitorProductId", 36);
  let destination = isUuid(competitorProductId)
    ? `/admin/competencia/${competitorProductId}`
    : "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const productId = formText(formData, "runiaProductId", 36);
    const reviewAt = formReviewAt(formData);
    if (!isUuid(productId) || !isUuid(competitorProductId)) {
      throw new PricingIntelligenceStoreError("El producto no es válido.", 400);
    }
    await createPricingIntelligenceServices().store.publishOpportunity({
      productId,
      newPrice: formNumber(formData, "newPrice"),
      expectedCurrentPrice: formNumber(formData, "expectedCurrentPrice"),
      expectedVersion: Math.trunc(formNumber(formData, "expectedVersion")),
      expectedSupplierCost: formNumber(formData, "expectedSupplierCost"),
      expectedCompetitorProductId: competitorProductId,
      expectedCompetitorPrice: formNumber(formData, "expectedCompetitorPrice"),
      expectedCompetitorFetchedAt: formText(formData, "expectedCompetitorFetchedAt", 64),
      reviewAt: reviewAt.toISOString(),
      approvedBy: session.authUserId,
    });
    revalidateTag("runia-real-catalog", "max");
    revalidateTag("lombardo-opportunities", "max");
    revalidatePath("/");
    revalidatePath("/oportunidades");
    revalidatePath("/sitemap.xml");
    revalidatePath("/admin/competencia");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Oportunidad publicada con precio e historial auditados.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos publicar la oportunidad.")}`;
  }
  redirect(destination);
}

export async function removeLombardoOpportunityAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const productId = formText(formData, "runiaProductId", 36);
    if (!isUuid(productId)) throw new PricingIntelligenceStoreError("El producto no es válido.", 400);
    await createPricingIntelligenceServices().store.removePublishedOpportunity(productId, session.authUserId);
    revalidateTag("runia-real-catalog", "max");
    revalidateTag("lombardo-opportunities", "max");
    revalidatePath("/");
    revalidatePath("/oportunidades");
    revalidatePath("/sitemap.xml");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Oportunidad quitada. El selling price no fue modificado.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos quitar la oportunidad.")}`;
  }
  redirect(destination);
}

export async function scheduleLombardoOpportunityReviewAction(formData: FormData) {
  let destination = "/admin/competencia";
  try {
    const session = await requireAdminRole("admin");
    const productId = formText(formData, "runiaProductId", 36);
    const reviewAt = formReviewAt(formData);
    if (!isUuid(productId)) {
      throw new PricingIntelligenceStoreError("Producto o fecha de revisión inválidos.", 422);
    }
    await createPricingIntelligenceServices().store.scheduleOpportunityReview(
      productId,
      reviewAt.toISOString(),
      session.authUserId,
    );
    revalidateTag("runia-real-catalog", "max");
    revalidateTag("lombardo-opportunities", "max");
    revalidatePath("/");
    revalidatePath("/oportunidades");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Revisión de oportunidad programada.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(error instanceof PricingIntelligenceStoreError ? error.message : "No pudimos programar la revisión.")}`;
  }
  redirect(destination);
}

export async function loginAdminAction(
  _state: AdminLoginState,
  formData: FormData,
): Promise<AdminLoginState> {
  const email = formText(formData, "email", 160).toLocaleLowerCase("en-US");
  const password = formRaw(formData, "password", 256);
  if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    return { error: "Revisá el email y la contraseña." };
  }

  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown";
  const rateLimit = checkRateLimit(`admin-login:${ip}:${email}`, {
    limit: 8,
    windowMs: 15 * 60_000,
  });
  if (!rateLimit.allowed) {
    return { error: "Demasiados intentos. Esperá unos minutos." };
  }

  try {
    const operator = await authenticateAdminCredentials(email, password);
    if (!operator) return { error: "No pudimos validar tus credenciales." };
  } catch {
    return { error: "El acceso no está disponible en este momento." };
  }
  redirect("/admin");
}

export async function logoutAdminAction() {
  await revokeAdminSession();
  redirect("/admin/login");
}

export async function createCustomerAction(formData: FormData) {
  let destination = "/admin/clientes";
  try {
    await requireAdminRole("admin");
    const input = parseAdminCustomerInput(formData);
    const customerId = await createCustomerWithInvite(input);
    revalidatePath("/admin/clientes");
    destination = `/admin/clientes/${customerId}?success=${encodeURIComponent(
      "Cliente creado. Enviamos la invitación para definir su contraseña.",
    )}`;
  } catch (error) {
    const message =
      error instanceof AdminStoreError || error instanceof CustomerAdminValidationError
        ? error.message
        : "No pudimos crear el cliente.";
    destination = `/admin/clientes/nuevo?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function updateCustomerAction(formData: FormData) {
  const customerId = formText(formData, "customerId", 36);
  let destination = `/admin/clientes/${customerId}`;
  try {
    await requireAdminRole("admin");
    const input = parseAdminCustomerInput(formData);
    await updateCustomer(input, customerId);
    revalidatePath("/admin/clientes");
    revalidatePath(`/admin/clientes/${customerId}`);
    destination += `?success=${encodeURIComponent("Cliente actualizado.")}`;
  } catch (error) {
    const message =
      error instanceof AdminStoreError || error instanceof CustomerAdminValidationError
        ? error.message
        : "No pudimos actualizar el cliente.";
    destination += `?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function createPromotionAction(formData: FormData) {
  let destination = "/admin/promociones/nuevo";
  try {
    const session = await requireAdminRole("admin");
    const id = await createAdminStore().createPromotion(parseAdminPromotionInput(formData), session.authUserId);
    revalidatePath("/admin/promociones");
    destination = `/admin/promociones/${id}?success=${encodeURIComponent("Promoción creada.")}`;
  } catch (error) {
    const message = error instanceof AdminStoreError || error instanceof PromotionAdminValidationError ? error.message : "No pudimos crear la promoción.";
    destination += `?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function updatePromotionAction(formData: FormData) {
  const promotionId = formText(formData, "promotionId", 36);
  let destination = `/admin/promociones/${promotionId}`;
  try {
    await requireAdminRole("admin");
    await createAdminStore().updatePromotion(promotionId, parseAdminPromotionInput(formData));
    revalidatePath("/admin/promociones");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Promoción actualizada.")}`;
  } catch (error) {
    const message = error instanceof AdminStoreError || error instanceof PromotionAdminValidationError ? error.message : "No pudimos actualizar la promoción.";
    destination += `?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

function secretCellarError(error: unknown) {
  return error instanceof SecretCellarInputError || error instanceof SecretCellarStoreError
    ? error.message
    : "No pudimos actualizar La Cava Secreta.";
}

export async function updateSecretCellarSettingsAction(formData: FormData) {
  let destination = "/admin/cava-secreta";
  try {
    const session = await requireAdminRole("admin");
    const number = (name: string) => Number(formText(formData, name, 10));
    await createSecretCellarService().updateSettings({
      enabled: formData.get("enabled") === "on",
      candidateCount: number("candidateCount"),
      clueCount: number("clueCount"),
      rewardPercentage: number("rewardPercentage"),
      rewardValidHours: number("rewardValidHours"),
    }, session.authUserId);
    revalidatePath("/");
    revalidatePath("/cava-secreta");
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Configuración guardada. Se aplica al próximo desafío que se genere.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(secretCellarError(error))}`;
  }
  redirect(destination);
}

export async function regenerateNextSecretCellarAction() {
  let destination = "/admin/cava-secreta";
  try {
    await requireAdminRole("admin");
    await createSecretCellarService().regenerateNextChallenge();
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("El desafío de mañana fue regenerado. El de hoy no cambió.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(secretCellarError(error))}`;
  }
  redirect(destination);
}

export async function excludeSecretCellarProductAction(formData: FormData) {
  let destination = "/admin/cava-secreta";
  try {
    const session = await requireAdminRole("admin");
    await createSecretCellarService().addExclusion(
      formText(formData, "productId", 36),
      formText(formData, "reason", 500),
      session.authUserId,
    );
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("Producto excluido de futuros desafíos.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(secretCellarError(error))}`;
  }
  redirect(destination);
}

export async function removeSecretCellarExclusionAction(formData: FormData) {
  let destination = "/admin/cava-secreta";
  try {
    await requireAdminRole("admin");
    await createSecretCellarService().removeExclusion(formText(formData, "productId", 36));
    revalidatePath(destination);
    destination += `?success=${encodeURIComponent("El producto vuelve a ser elegible para próximos desafíos.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(secretCellarError(error))}`;
  }
  redirect(destination);
}

export async function transitionOrderAction(formData: FormData) {
  const session = await requireAdminSession();
  const publicId = formText(formData, "publicId", 36);
  const expected = formText(formData, "expectedStatus", 20);
  const target = formText(formData, "targetStatus", 20);
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      publicId,
    ) ||
    !validStatus(expected) ||
    !validStatus(target)
  ) {
    redirect(`/admin/pedidos?error=${encodeURIComponent("Solicitud inválida.")}`);
  }

  let destination = `/admin/pedidos/${publicId}`;
  try {
    const store = createAdminStore();
    const order = await store.getOrder(publicId);
    if (!order) {
      destination = "/admin/pedidos?error=Pedido%20no%20encontrado";
    } else {
      const result = await store.transitionFulfillment(
        order.id,
        expected,
        target,
        session.authUserId,
      );
      const message = result.changed
        ? "Estado actualizado."
        : "El pedido ya estaba en ese estado.";
      destination += `?success=${encodeURIComponent(message)}`;
      revalidatePath("/admin");
      revalidatePath("/admin/pedidos");
      revalidatePath(`/admin/pedidos/${publicId}`);
    }
  } catch (error) {
    const message =
      error instanceof AdminStoreError
        ? error.message
        : "No pudimos actualizar el pedido.";
    destination += `?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

function adminOrderError(error: unknown) {
  if (error instanceof AdminOrderValidationError || error instanceof AdminStoreError) {
    return error.message;
  }
  return "No pudimos guardar el pedido.";
}

export async function createManualOrderAction(formData: FormData) {
  let destination = "/admin/pedidos/nuevo";
  try {
    const session = await requireAdminRole("admin");
    const payload = parseAdminOrderPayload(formRaw(formData, "payload", 60_000), {
      allowLegacyDeliveryMethods: false,
    });
    const store = createAdminStore();
    const products = await store.getOrderProductsByIds(
      payload.items.map((item) => item.productId),
    );
    const input = buildAdminOrderManagementInput(payload, products);
    const order = await store.createManualOrder(input, session.authUserId);
    revalidatePath("/admin");
    revalidatePath("/admin/pedidos");
    destination = `/admin/pedidos/${order.publicId}?success=${encodeURIComponent("Pedido manual creado.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(adminOrderError(error))}`;
  }
  redirect(destination);
}

export async function updateAdminOrderAction(formData: FormData) {
  const publicId = formText(formData, "publicId", 36);
  let destination = /^[0-9a-f-]{36}$/i.test(publicId)
    ? `/admin/pedidos/${publicId}/editar`
    : "/admin/pedidos";
  try {
    const session = await requireAdminRole("admin");
    const orderId = formText(formData, "orderId", 18);
    const revision = Number(formText(formData, "revision", 12));
    const payload = parseAdminOrderPayload(formRaw(formData, "payload", 60_000));
    const store = createAdminStore();
    const products = await store.getOrderProductsByIds(
      payload.items.map((item) => item.productId),
    );
    const input = buildAdminOrderManagementInput(payload, products);
    const order = await store.updateOrderManagement(
      orderId,
      revision,
      input,
      session.authUserId,
    );
    revalidatePath("/admin");
    revalidatePath("/admin/pedidos");
    revalidatePath(`/admin/pedidos/${order.publicId}`);
    destination = `/admin/pedidos/${order.publicId}?success=${encodeURIComponent("Pedido actualizado. El snapshot comercial original quedó intacto.")}`;
  } catch (error) {
    destination += `?error=${encodeURIComponent(adminOrderError(error))}`;
  }
  redirect(destination);
}

export async function retryOrderNotificationAction(formData: FormData) {
  await requireAdminSession();
  const publicId = formText(formData, "publicId", 36);
  const kind = formText(formData, "kind", 40);
  if (
    (kind !== "new_order" && kind !== "customer_order_confirmation") ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      publicId,
    )
  ) {
    redirect("/admin/pedidos?error=Solicitud%20inv%C3%A1lida");
  }

  let destination = `/admin/pedidos/${publicId}`;
  try {
    const order = await createOrderServices().orders.getByPublicId(publicId);
    const notifier =
      kind === "customer_order_confirmation"
        ? createCustomerOrderConfirmationNotifier()
        : createNewOrderNotifier();
    if (!order) throw new AdminStoreError("Pedido no encontrado.", 404);
    if (!notifier) {
      throw new AdminStoreError("Las notificaciones automáticas están desactivadas.", 409);
    }
    const result = await notifier.retry(order);
    const message = result.claimed
      ? "Reintento de notificación procesado."
      : "La notificación no admite otro reintento automático.";
    destination += `?success=${encodeURIComponent(message)}`;
    revalidatePath(`/admin/pedidos/${publicId}`);
  } catch (error) {
    const message =
      error instanceof AdminStoreError
        ? error.message
        : "No pudimos reintentar la notificación.";
    destination += `?error=${encodeURIComponent(message)}`;
  }
  redirect(destination);
}

export async function createAdminOrderAction(
  _previousState: AdminCreateOrderState,
  formData: FormData,
): Promise<AdminCreateOrderState> {
  try {
    const session = await requireAdminRole("admin");
    const customerId = formText(formData, "customerId", 36);
    const rawItems = formRaw(formData, "items", 24_000);
    const parsedItems = JSON.parse(rawItems || "[]") as unknown;
    const submittedItems = parseAdminAssistedOrderItems(parsedItems);
    const store = createAdminStore();
    const orderContext = customerId === "guest"
      ? null
      : await store.getCustomerOrderContext(customerId);
    if (customerId !== "guest" && !orderContext) {
      throw new AdminStoreError(
        "Elegí un cliente activo con una política comercial válida.",
        422,
      );
    }

    const deliveryMethod = formText(formData, "deliveryMethod", 16);
    const existingCustomer = orderContext?.customer;
    const input = parseCreateOrderInput({
      checkoutSessionId: formText(formData, "checkoutSessionId", 160),
      idempotencyKey: formText(formData, "idempotencyKey", 160),
      items: parsedItems,
      customer: {
        firstName: existingCustomer?.name || formText(formData, "firstName", 100),
        lastName: existingCustomer ? "_" : formText(formData, "lastName", 100),
        whatsapp: existingCustomer?.whatsapp || formText(formData, "whatsapp", 20),
        email: existingCustomer?.email || formText(formData, "email", 254),
      },
      deliveryMethod,
      deliveryAddress: {
        street: formText(formData, "street", 160),
        number: formText(formData, "number", 30),
        floorApartment: formText(formData, "floorApartment", 80),
        city: formText(formData, "city", 100),
        province: formText(formData, "province", 100),
        postalCode: formText(formData, "postalCode", 20),
        references: formText(formData, "references", 500),
      },
      couponCode: formText(formData, "couponCode", 40) || undefined,
    });
    input.orderSource = "admin_manual";
    const manualPricesRequested = hasAdminManualPrices(submittedItems);
    if (input.couponCode && manualPricesRequested) {
      throw new AdminAssistedOrderError(
        "El precio manual no se combina con un cupón.",
      );
    }
    if (existingCustomer) {
      input.customer = {
        firstName: existingCustomer.name,
        lastName: "",
        whatsapp: existingCustomer.whatsapp,
        email: existingCustomer.email,
      };
    }

    const pricingContext = orderContext?.pricingContext ??
      await store.getGuestOrderPricingContext();
    const { orders } = createOrderServices(pricingContext);
    const result = await orders.createOrder(input);
    let order = await orders.savePaymentMethod(
      result.order.id,
      "whatsapp_coordination",
    );
    if (manualPricesRequested) {
      const current = await store.getOrder(order.publicId);
      if (!current) {
        throw new AdminStoreError("No pudimos recuperar el pedido creado.", 502);
      }
      if (!adminAssistedManagementMatches(current.items, submittedItems)) {
        const management = buildAdminAssistedManagement(
          order,
          submittedItems,
          formText(formData, "manualPriceReason", 500),
        );
        if (!management) {
          throw new AdminAssistedOrderError(
            "No pudimos aplicar el precio manual.",
          );
        }
        await store.updateOrderManagement(
          current.id,
          current.managementRevision,
          management,
          session.authUserId,
        );
      }
      order = await orders.getById(order.id) ?? order;
    }

    if (!result.reused) {
      const notifiers = [
        createNewOrderNotifier(),
        createCustomerOrderConfirmationNotifier(),
      ].filter((notifier) => notifier !== null);
      await Promise.allSettled(notifiers.map((notifier) => notifier.notify(order)));
    }

    revalidatePath("/admin");
    revalidatePath("/admin/pedidos");
    if (customerId !== "guest") revalidatePath(`/admin/clientes/${customerId}`);
    return {
      status: "success",
      message: manualPricesRequested
        ? "Pedido creado con el precio manual auditado."
        : "Pedido creado con los precios vigentes de la cuenta.",
      publicId: order.publicId,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof AdminAssistedOrderError ||
        error instanceof AdminStoreError ||
        error instanceof ServerOrderError
          ? error.message
          : "No pudimos crear el pedido. Revisá los datos e intentá nuevamente.",
    };
  }
}

function productDestination(productId: string, type: "success" | "error", message: string) {
  return `/admin/productos/${productId}?${type}=${encodeURIComponent(message)}`;
}

export async function saveProductEditorialAction(formData: FormData) {
  const session = await requireAdminSession();
  const productId = formText(formData, "productId", 36);
  let destination = productDestination(productId, "success", "Datos editoriales guardados.");
  try {
    const categorySlug = formText(formData, "categorySlug", 80).toLocaleLowerCase("es-AR");
    if (categorySlug && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(categorySlug)) {
      throw new AdminStoreError("La categoría debe usar letras, números y guiones.", 422);
    }
    const status = formText(formData, "editorialStatus", 16) === "approved" ? "approved" : "draft";
    await createAdminStore().saveProductEditorial(productId, {
      nameOverride: formText(formData, "nameOverride", 240) || undefined,
      brandName: formText(formData, "brandName", 120) || undefined,
      categorySlug: categorySlug || undefined,
      description: formText(formData, "description", 4000) || undefined,
      tags: formText(formData, "tags", 1200).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 30),
      internalNotes: formText(formData, "internalNotes", 4000) || undefined,
      status,
    }, session.authUserId);
    revalidatePath("/admin/productos");
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/productos");
  } catch (error) {
    destination = productDestination(
      productId,
      "error",
      error instanceof AdminStoreError ? error.message : "No pudimos guardar los datos editoriales.",
    );
  }
  redirect(destination);
}

export async function setPrimaryProductImageAction(formData: FormData) {
  await requireAdminSession();
  const productId = formText(formData, "productId", 36);
  const mediaId = formText(formData, "mediaId", 36);
  let destination = productDestination(productId, "success", "Imagen principal actualizada.");
  try {
    await createAdminStore().setPrimaryMedia(productId, mediaId);
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/productos");
  } catch (error) {
    destination = productDestination(productId, "error", error instanceof AdminStoreError ? error.message : "No pudimos actualizar la imagen.");
  }
  redirect(destination);
}

export async function moveProductImageAction(formData: FormData) {
  await requireAdminSession();
  const productId = formText(formData, "productId", 36);
  const mediaId = formText(formData, "mediaId", 36);
  const direction = formText(formData, "direction", 8);
  let destination = productDestination(productId, "success", "Galería ordenada.");
  try {
    const store = createAdminStore();
    const product = await store.getProduct(productId);
    if (!product) throw new AdminStoreError("Producto no encontrado.", 404);
    const ids = product.media.map((media) => media.id);
    const index = ids.indexOf(mediaId);
    const target = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= ids.length) {
      throw new AdminStoreError("La imagen ya está en ese extremo.", 422);
    }
    [ids[index], ids[target]] = [ids[target], ids[index]];
    await store.reorderProductMedia(productId, ids);
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/productos");
  } catch (error) {
    destination = productDestination(productId, "error", error instanceof AdminStoreError ? error.message : "No pudimos ordenar la galería.");
  }
  redirect(destination);
}

export async function deleteProductImageAction(formData: FormData) {
  await requireAdminSession();
  const productId = formText(formData, "productId", 36);
  const mediaId = formText(formData, "mediaId", 36);
  let destination = productDestination(productId, "success", "Imagen eliminada.");
  try {
    await createAdminStore().deleteProductMedia(productId, mediaId);
    revalidatePath(`/admin/productos/${productId}`);
    revalidatePath("/productos");
  } catch (error) {
    destination = productDestination(productId, "error", error instanceof AdminStoreError ? error.message : "No pudimos eliminar la imagen.");
  }
  redirect(destination);
}

export async function reviewImageCandidateAction(formData: FormData) {
  const session = await requireAdminSession();
  const candidateId = formText(formData, "candidateId", 36);
  const decision = formText(formData, "decision", 16);
  const returnStatus = formText(formData, "returnStatus", 16);
  const params = new URLSearchParams();
  if (["pending", "approved", "rejected"].includes(returnStatus)) {
    params.set("status", returnStatus);
  }
  try {
    if (decision !== "approved" && decision !== "rejected") {
      throw new AdminStoreError("Decisión inválida.", 400);
    }
    await createAdminStore().reviewImageCandidate(candidateId, decision, session.authUserId);
    params.set(
      "success",
      decision === "approved"
        ? "Match aprobado. La imagen sigue sin publicarse hasta validar derechos."
        : "Candidato rechazado.",
    );
    revalidatePath("/admin/imagenes");
  } catch (error) {
    params.set(
      "error",
      error instanceof AdminStoreError ? error.message : "No pudimos guardar la revisión.",
    );
  }
  redirect(`/admin/imagenes?${params}`);
}

export async function bulkReviewImageCandidatesAction(formData: FormData) {
  const session = await requireAdminSession();
  const ids = candidateIds(formData);
  const decision = formText(formData, "decision", 16);
  const returnStatus = formText(formData, "returnStatus", 16);
  const returnConfidence = formText(formData, "returnConfidence", 16);
  const params = new URLSearchParams();
  if (["pending", "approved", "rejected"].includes(returnStatus)) params.set("status", returnStatus);
  if (["high", "medium", "low"].includes(returnConfidence)) params.set("confidence", returnConfidence);

  try {
    if (!ids.length) throw new AdminStoreError("Seleccioná al menos un candidato.", 400);
    if (decision !== "approved" && decision !== "rejected") {
      throw new AdminStoreError("Decisión masiva inválida.", 400);
    }
    const store = createAdminStore();
    if (decision === "rejected") {
      const results = await settleInBatches(ids, 10, (id) =>
        store.reviewImageCandidate(id, "rejected", session.authUserId));
      const rejected = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - rejected;
      if (!rejected) throw new AdminStoreError("No pudimos rechazar los candidatos seleccionados.", 502);
      params.set("success", `${rejected} candidato${rejected === 1 ? "" : "s"} rechazado${rejected === 1 ? "" : "s"}.${failed ? ` ${failed} no se pudo procesar.` : ""}`);
    } else {
      const results = await settleInBatches(ids, 5, async (id) => {
        await store.reviewImageCandidate(id, "approved", session.authUserId);
        await store.publishApprovedImageCandidate(id, session.authUserId);
      });
      const published = results.filter((result) => result.status === "fulfilled").length;
      const failed = results.length - published;
      if (!published) throw new AdminStoreError("No pudimos publicar las imágenes seleccionadas.", 502);
      params.set("success", `${published} imagen${published === 1 ? "" : "es"} aprobada${published === 1 ? "" : "s"} y publicada${published === 1 ? "" : "s"} como principal.${failed ? ` ${failed} requiere reintento desde Match aprobado.` : ""}`);
      if (failed) params.set("status", "approved");
    }
    revalidatePath("/admin/imagenes");
    revalidatePath("/admin/productos");
    revalidatePath("/productos");
  } catch (error) {
    params.set("error", error instanceof AdminStoreError ? error.message : "No pudimos procesar la selección.");
  }
  redirect(`/admin/imagenes?${params}`);
}

export async function publishImageCandidateAction(formData: FormData) {
  const session = await requireAdminSession();
  const candidateId = formText(formData, "candidateId", 36);
  const params = new URLSearchParams({ status: "approved" });
  try {
    await createAdminStore().publishApprovedImageCandidate(candidateId, session.authUserId);
    params.set("success", "Imagen publicada como principal con su fuente registrada.");
    revalidatePath("/admin/imagenes");
    revalidatePath("/admin/productos");
    revalidatePath("/productos");
  } catch (error) {
    params.set("error", error instanceof AdminStoreError ? error.message : "No pudimos publicar la imagen.");
  }
  redirect(`/admin/imagenes?${params}`);
}

export async function reviewPublishedImageCandidateAction(formData: FormData) {
  const session = await requireAdminSession();
  const candidateId = formText(formData, "candidateId", 36);
  const decision = formText(formData, "decision", 24);
  const returnView = formText(formData, "returnView", 24);
  const params = new URLSearchParams({ view: returnView === "priority" ? "priority" : "needs_review" });
  try {
    if (decision !== "correct" && decision !== "remove" && decision !== "search_other") {
      throw new AdminStoreError("Acción de imagen inválida.", 400);
    }
    await createAdminStore().reviewPublishedImageCandidate(candidateId, decision, session.authUserId);
    params.set("success", decision === "correct"
      ? "La imagen quedó marcada como correcta."
      : decision === "remove"
        ? "La imagen fue quitada y se restauró el fallback Lombardo."
        : "La imagen fue quitada y quedó señalada para buscar otra fuente.");
    revalidatePath("/admin/imagenes");
    revalidatePath("/admin/productos");
    revalidatePath("/productos");
  } catch (error) {
    params.set("error", error instanceof AdminStoreError ? error.message : "No pudimos actualizar la imagen.");
  }
  redirect(`/admin/imagenes?${params}`);
}
