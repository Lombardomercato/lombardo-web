"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  authenticateAdminCredentials,
  createAdminStore,
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
