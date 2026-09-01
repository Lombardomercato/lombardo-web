import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { DeliveryAddress } from "@/types/checkout";

import type { CustomerAccountSummary } from "./types";

interface AccountAddressRow {
  id: string;
  address_line: string;
  city: string | null;
  province: string | null;
  postal_code: string | null;
  metadata_json: unknown;
}

function metadataText(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }
  const value = Reflect.get(metadata, key);
  return typeof value === "string" ? value.trim() : "";
}

export function mapCustomerDefaultAddress(
  row: AccountAddressRow | null | undefined,
): DeliveryAddress | null {
  if (!row) return null;
  const street = metadataText(row.metadata_json, "street") || row.address_line.trim();
  const number = metadataText(row.metadata_json, "number");
  const city = row.city?.trim() ?? "";
  const province = row.province?.trim() ?? "";
  if (!street || !number || !city || !province) return null;

  return {
    street,
    number,
    floorApartment:
      metadataText(row.metadata_json, "floorApartment") || undefined,
    city,
    province,
    postalCode: row.postal_code?.trim() || undefined,
    references: metadataText(row.metadata_json, "references") || undefined,
  };
}

export async function loadCustomerDefaultAddress(
  supabase: SupabaseClient,
  account: CustomerAccountSummary,
) {
  const { data, error } = await supabase
    .from("account_addresses")
    .select("id,address_line,city,province,postal_code,metadata_json")
    .eq("tenant_id", account.tenantId)
    .eq("account_id", account.id)
    .eq("is_primary", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo cargar la dirección predeterminada.", {
      cause: error,
    });
  }
  return mapCustomerDefaultAddress(data as AccountAddressRow | null);
}

export async function saveCustomerDefaultAddress(
  supabase: SupabaseClient,
  account: CustomerAccountSummary,
  address: DeliveryAddress,
) {
  const payload = {
    label: "Dirección predeterminada",
    address_line: `${address.street} ${address.number}`.trim(),
    city: address.city,
    province: address.province,
    postal_code: address.postalCode ?? null,
    country: "AR",
    is_primary: true,
    is_active: true,
    metadata_json: {
      street: address.street,
      number: address.number,
      floorApartment: address.floorApartment ?? "",
      references: address.references ?? "",
    },
    updated_at: new Date().toISOString(),
  };

  const existing = await supabase
    .from("account_addresses")
    .select("id")
    .eq("tenant_id", account.tenantId)
    .eq("account_id", account.id)
    .eq("is_primary", true)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (existing.error) {
    throw new Error("No se pudo validar la dirección predeterminada.", {
      cause: existing.error,
    });
  }

  if (existing.data?.id) {
    const { error } = await supabase
      .from("account_addresses")
      .update(payload)
      .eq("id", existing.data.id)
      .eq("tenant_id", account.tenantId)
      .eq("account_id", account.id);
    if (error) {
      throw new Error("No se pudo actualizar la dirección predeterminada.", {
        cause: error,
      });
    }
    return;
  }

  const { error } = await supabase.from("account_addresses").insert({
    ...payload,
    tenant_id: account.tenantId,
    account_id: account.id,
  });
  if (error) {
    throw new Error("No se pudo guardar la dirección predeterminada.", {
      cause: error,
    });
  }
}
