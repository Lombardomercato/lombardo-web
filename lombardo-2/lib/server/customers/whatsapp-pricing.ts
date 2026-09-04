import "server-only";

import { readRuniaConfiguration } from "@/lib/server/environment";
import {
  fetchSupabaseRest,
  supabaseRestResponseError,
} from "@/lib/server/supabase-rest";

import type {
  CustomerAccountType,
  CustomerPricingContext,
  CustomerPricingPolicy,
  SupplierSalePriceType,
} from "./types";

interface WhatsAppCustomerRow {
  id: string;
  tenant_id: string;
  auth_user_id: string | null;
  name: string;
  email: string | null;
  account_type: string;
  pricing_policy: string;
  discount_percent: number | string;
}

export interface VerifiedWhatsAppCustomer {
  name: string;
  email: string;
  pricing: CustomerPricingContext;
}

function isAccountType(value: string): value is CustomerAccountType {
  return value === "RETAIL" || value === "WHOLESALE" || value === "BUSINESS";
}

function isPricingPolicy(value: string): value is CustomerPricingPolicy {
  return value === "RETAIL" || value === "WHOLESALE" || value === "BUSINESS" || value === "CUSTOM_DISCOUNT";
}

function basePriceType(policy: CustomerPricingPolicy): SupplierSalePriceType {
  if (policy === "WHOLESALE") return "wholesale";
  if (policy === "BUSINESS") return "business";
  return "retail";
}

function mapVerifiedCustomer(row: WhatsAppCustomerRow): VerifiedWhatsAppCustomer | null {
  if (!isAccountType(row.account_type) || !isPricingPolicy(row.pricing_policy)) return null;
  const discountPercent = Number(row.discount_percent);
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent >= 100) return null;
  if (row.pricing_policy === "CUSTOM_DISCOUNT" && discountPercent <= 0) return null;
  if (row.pricing_policy !== "CUSTOM_DISCOUNT" && discountPercent !== 0) return null;

  return {
    name: row.name.trim(),
    email: row.email?.trim().toLocaleLowerCase("es-AR") ?? "",
    pricing: {
      tenantRecordId: row.tenant_id,
      tenantSlug: "lombardo",
      authUserId: row.auth_user_id ?? undefined,
      customerAccountId: row.id,
      accountType: row.account_type,
      policy: row.pricing_policy,
      basePriceType: basePriceType(row.pricing_policy),
      discountPercent,
      contextKey: ["whatsapp", row.id, row.pricing_policy, String(discountPercent)].join(":"),
    },
  };
}

export async function resolveVerifiedWhatsAppCustomer(
  senderPhone: string,
): Promise<VerifiedWhatsAppCustomer | null> {
  const digits = senderPhone.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) return null;

  const configuration = readRuniaConfiguration();
  const response = await fetchSupabaseRest(
    `${configuration.url}/rest/v1/rpc/lombardo_resolve_whatsapp_customer`,
    {
      method: "POST",
      headers: {
        apikey: configuration.secretKey,
        Authorization: `Bearer ${configuration.secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_tenant_slug: configuration.tenantSlug,
        p_phone: `+${digits}`,
      }),
      cache: "no-store",
    },
    { operation: "Resolve verified WhatsApp customer" },
  );
  if (!response.ok) {
    throw new Error("No se pudo resolver la cuenta de WhatsApp.", {
      cause: await supabaseRestResponseError(response, "Resolve verified WhatsApp customer"),
    });
  }
  const rows = (await response.json()) as WhatsAppCustomerRow[];
  return rows.length === 1 ? mapVerifiedCustomer(rows[0]) : null;
}
