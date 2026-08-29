"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
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

export interface AdminLoginState {
  error?: string;
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
  const params = new URLSearchParams({ view: "needs_review" });
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
