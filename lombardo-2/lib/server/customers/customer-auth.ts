import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { redirect } from "next/navigation";

import { readRuniaConfiguration } from "@/lib/server/environment";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import {
  retailPricingContext,
  type CustomerAccountSummary,
  type CustomerAccountType,
  type CustomerPricingContext,
  type CustomerPricingPolicy,
  type SupplierSalePriceType,
} from "./types";
import { sanitizeCustomerReturnPath } from "./validation";

interface TenantRow {
  id: string;
}

interface CustomerAccountRow {
  id: string;
  tenant_id: string;
  auth_user_id: string;
  name: string;
  email: string | null;
  whatsapp_phone: string | null;
  phone: string | null;
  account_type: string;
  pricing_policy: string;
  discount_percent: number | string;
  status: string;
}

function isAccountType(value: string): value is CustomerAccountType {
  return value === "RETAIL" || value === "WHOLESALE" || value === "BUSINESS";
}

function isPricingPolicy(value: string): value is CustomerPricingPolicy {
  return (
    value === "RETAIL" ||
    value === "WHOLESALE" ||
    value === "BUSINESS" ||
    value === "CUSTOM_DISCOUNT"
  );
}

function basePriceType(policy: CustomerPricingPolicy): SupplierSalePriceType {
  if (policy === "WHOLESALE") return "wholesale";
  if (policy === "BUSINESS") return "business";
  return "retail";
}

function claimsSubject(claims: unknown) {
  if (!claims || typeof claims !== "object") return null;
  const subject = Reflect.get(claims, "sub");
  return typeof subject === "string" && subject.length > 0 ? subject : null;
}

function mapAccount(row: CustomerAccountRow): CustomerAccountSummary | null {
  if (
    row.status !== "active" ||
    !isAccountType(row.account_type) ||
    !isPricingPolicy(row.pricing_policy)
  ) {
    return null;
  }

  const rawDiscount = Number(row.discount_percent);
  const discountPercent =
    row.pricing_policy === "CUSTOM_DISCOUNT" &&
    Number.isFinite(rawDiscount) &&
    rawDiscount > 0 &&
    rawDiscount < 100
      ? rawDiscount
      : 0;

  if (row.pricing_policy === "CUSTOM_DISCOUNT" && discountPercent === 0) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    authUserId: row.auth_user_id,
    name: row.name.trim(),
    email: row.email?.trim() ?? "",
    whatsapp: row.whatsapp_phone?.trim() || row.phone?.trim() || "",
    accountType: row.account_type,
    pricingPolicy: row.pricing_policy,
    discountPercent,
    status: "active",
  };
}

async function resolveConfiguredTenant(): Promise<{
  id: string;
  slug: string;
}> {
  const configuration = readRuniaConfiguration();
  const search = new URLSearchParams({
    select: "id",
    slug: `eq.${configuration.tenantSlug}`,
    limit: "1",
  });
  const response = await fetch(`${configuration.url}/rest/v1/tenants?${search}`, {
    headers: {
      apikey: configuration.secretKey,
      Authorization: `Bearer ${configuration.secretKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("No se pudo resolver el tenant configurado.");
  }
  const rows = (await response.json()) as TenantRow[];
  if (!rows[0]?.id) {
    throw new Error("El tenant configurado no existe o no está disponible.");
  }

  return { id: rows[0].id, slug: configuration.tenantSlug };
}

export async function getActiveCustomerAccountForClient(
  supabase: SupabaseClient,
  tenantId: string,
  authUserId: string,
) {
  const { data, error } = await supabase
    .from("customer_accounts")
    .select(
      "id,tenant_id,auth_user_id,name,email,whatsapp_phone,phone,account_type,pricing_policy,discount_percent,status",
    )
    .eq("tenant_id", tenantId)
    .eq("auth_user_id", authUserId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error("No se pudo validar la cuenta del cliente.", { cause: error });
  }
  return data ? mapAccount(data as CustomerAccountRow) : null;
}

export async function getClaimsSubjectForClient(supabase: SupabaseClient) {
  const { data, error } = await supabase.auth.getClaims();
  if (error) return null;
  return claimsSubject(data?.claims);
}

export async function getCurrentCustomerAccount() {
  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  if (!authUserId) return null;

  const tenant = await resolveConfiguredTenant();
  return getActiveCustomerAccountForClient(supabase, tenant.id, authUserId);
}

export async function requireCurrentCustomerAccount(
  returnPath = "/mi-cuenta",
) {
  const account = await getCurrentCustomerAccount();
  if (account) return account;

  const next = sanitizeCustomerReturnPath(returnPath);
  redirect(`/login?next=${encodeURIComponent(next)}`);
}

export async function getCurrentCustomerPricingContext(): Promise<CustomerPricingContext> {
  const tenant = await resolveConfiguredTenant();
  const guest = {
    ...retailPricingContext(tenant.slug),
    tenantRecordId: tenant.id,
  };
  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  if (!authUserId) return guest;

  const account = await getActiveCustomerAccountForClient(
    supabase,
    tenant.id,
    authUserId,
  );
  if (!account) return guest;

  return {
    tenantRecordId: tenant.id,
    tenantSlug: tenant.slug,
    authUserId,
    customerAccountId: account.id,
    accountType: account.accountType,
    policy: account.pricingPolicy,
    basePriceType: basePriceType(account.pricingPolicy),
    discountPercent: account.discountPercent,
    contextKey: [
      "customer",
      account.id,
      account.pricingPolicy,
      String(account.discountPercent),
    ].join(":"),
  };
}
