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
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      publicId,
    )
  ) {
    redirect("/admin/pedidos?error=Solicitud%20inv%C3%A1lida");
  }

  let destination = `/admin/pedidos/${publicId}`;
  try {
    const order = await createOrderServices().orders.getByPublicId(publicId);
    const notifier = createNewOrderNotifier();
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
