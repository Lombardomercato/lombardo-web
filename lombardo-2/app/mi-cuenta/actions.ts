"use server";

import { revalidatePath } from "next/cache";

import { validateCustomerDefaultAddress } from "@/lib/customer-address";
import { getCurrentCustomerAccount } from "@/lib/server/customers/customer-auth";
import { saveCustomerDefaultAddress } from "@/lib/server/customers/default-address";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CustomerAddressActionState {
  status: "idle" | "error" | "success";
  message: string;
}

export async function updateCustomerDefaultAddress(
  _previousState: CustomerAddressActionState,
  formData: FormData,
): Promise<CustomerAddressActionState> {
  const validation = validateCustomerDefaultAddress(formData);
  if (!validation.valid) {
    return { status: "error", message: validation.message };
  }

  const account = await getCurrentCustomerAccount();
  if (!account) {
    return {
      status: "error",
      message: "La sesión venció. Volvé a ingresar para guardar la dirección.",
    };
  }

  try {
    const supabase = await createSupabaseServerClient();
    await saveCustomerDefaultAddress(supabase, account, validation.address);
    revalidatePath("/mi-cuenta");
    revalidatePath("/checkout");
    return {
      status: "success",
      message: "Dirección predeterminada guardada.",
    };
  } catch {
    return {
      status: "error",
      message: "No pudimos guardar la dirección. Probá nuevamente.",
    };
  }
}
