import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createAdminStore } from "../admin/admin-auth";
import { AdminStoreError } from "../admin/runia-admin-store";
import type { AdminCustomerInput } from "../admin/types";
import { readAdminConfiguration } from "../environment";

function createCustomerAuthAdmin() {
  const { url, secretKey } = readAdminConfiguration();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;
}

export async function createCustomerWithInvite(input: AdminCustomerInput) {
  const origin = process.env.APP_URL?.trim().replace(/\/$/, "");
  const redirectTo = origin
    ? `${origin}/auth/callback?next=/nueva-clave`
    : undefined;
  const authAdmin = createCustomerAuthAdmin();
  const { data, error } = await authAdmin.inviteUserByEmail(input.email, {
    redirectTo,
  });
  if (error || !data.user?.id) {
    throw new AdminStoreError(
      error?.status === 422
        ? "El email ya tiene un acceso registrado."
        : "No pudimos enviar la invitación al cliente.",
      error?.status === 422 ? 409 : 502,
    );
  }

  try {
    return await createAdminStore().createCustomerAccount(input, data.user.id);
  } catch (error) {
    await authAdmin.deleteUser(data.user.id).catch(() => undefined);
    throw error;
  }
}

export async function updateCustomer(input: AdminCustomerInput, customerId: string) {
  const store = createAdminStore();
  const current = await store.getCustomer(customerId);
  if (!current) throw new AdminStoreError("Cliente no encontrado.", 404);
  if (current.email !== input.email) {
    throw new AdminStoreError(
      "El email de acceso no se puede cambiar desde esta pantalla.",
      422,
    );
  }
  await store.updateCustomerAccount(customerId, input);
}

function customerInputWithStatus(
  customer: Awaited<ReturnType<ReturnType<typeof createAdminStore>["getCustomer"]>>,
  status: AdminCustomerInput["status"],
) {
  if (!customer) throw new AdminStoreError("Cliente no encontrado.", 404);
  return {
    name: customer.name,
    email: customer.email,
    whatsapp: customer.whatsapp,
    accountType: customer.accountType,
    pricingPolicy: customer.pricingPolicy,
    discountPercent: customer.discountPercent,
    status,
  } satisfies AdminCustomerInput;
}

export async function setCustomerArchived(customerId: string, archived: boolean) {
  const store = createAdminStore();
  const customer = await store.getCustomer(customerId);
  await store.updateCustomerAccount(
    customerId,
    customerInputWithStatus(customer, archived ? "inactive" : "active"),
  );
}

export async function deleteCustomer(customerId: string) {
  const store = createAdminStore();
  const customer = await store.getCustomer(customerId);
  if (!customer) throw new AdminStoreError("Cliente no encontrado.", 404);
  if (customer.status !== "inactive") {
    throw new AdminStoreError(
      "Archivá el cliente antes de eliminarlo definitivamente.",
      409,
    );
  }
  if (customer.orderCount > 0) {
    throw new AdminStoreError(
      "Este cliente tiene pedidos. Archivá la cuenta para conservar el historial.",
      409,
    );
  }

  await store.deleteCustomerAccount(customerId);

  if (!customer.authUserId) return undefined;
  const { error } = await createCustomerAuthAdmin().deleteUser(customer.authUserId);
  return error
    ? "El cliente fue eliminado, pero no pudimos limpiar su antiguo acceso."
    : undefined;
}
