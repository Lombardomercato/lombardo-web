import "server-only";

import { createClient } from "@supabase/supabase-js";

import { createAdminStore } from "@/lib/server/admin/admin-auth";
import { readAdminConfiguration } from "@/lib/server/environment";

interface RetailCustomerRegistration {
  name: string;
  email: string;
  whatsapp: string;
}

function createCustomerAuthAdmin() {
  const { url, secretKey } = readAdminConfiguration();
  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }).auth.admin;
}

export async function provisionRetailCustomerAccount(
  input: RetailCustomerRegistration,
  authUserId: string,
) {
  try {
    return await createAdminStore().createCustomerAccount(
      {
        name: input.name,
        email: input.email,
        whatsapp: input.whatsapp,
        accountType: "RETAIL",
        pricingPolicy: "RETAIL",
        discountPercent: 0,
        status: "active",
      },
      authUserId,
    );
  } catch (error) {
    await createCustomerAuthAdmin().deleteUser(authUserId).catch(() => undefined);
    throw error;
  }
}
