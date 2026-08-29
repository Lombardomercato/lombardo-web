import type { AdminCustomerInput } from "../admin/types.ts";
import type {
  CustomerAccountType,
  CustomerPricingPolicy,
} from "./types.ts";
import { normalizeCustomerEmail } from "./validation.ts";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;
const ACCOUNT_TYPES = new Set<CustomerAccountType>([
  "RETAIL",
  "WHOLESALE",
  "BUSINESS",
]);
const PRICING_POLICIES = new Set<CustomerPricingPolicy>([
  "RETAIL",
  "WHOLESALE",
  "BUSINESS",
  "CUSTOM_DISCOUNT",
]);
const ACCOUNT_STATUSES = new Set<AdminCustomerInput["status"]>([
  "active",
  "inactive",
  "pending",
  "blocked",
]);

export class CustomerAdminValidationError extends Error {}

function formText(formData: FormData, name: string, maximum: number) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function coherentPolicy(
  accountType: CustomerAccountType,
  pricingPolicy: CustomerPricingPolicy,
) {
  return (
    (accountType === "RETAIL" &&
      (pricingPolicy === "RETAIL" || pricingPolicy === "CUSTOM_DISCOUNT")) ||
    (accountType === "WHOLESALE" && pricingPolicy === "WHOLESALE") ||
    (accountType === "BUSINESS" && pricingPolicy === "BUSINESS")
  );
}

export function parseAdminCustomerInput(formData: FormData): AdminCustomerInput {
  const name = formText(formData, "name", 120);
  const email = normalizeCustomerEmail(formText(formData, "email", 254));
  const whatsapp = formText(formData, "whatsapp", 24).replace(/[\s()-]/g, "");
  const rawAccountType = formText(formData, "accountType", 20);
  const rawPolicy = formText(formData, "pricingPolicy", 24);
  const rawStatus = formText(formData, "status", 20);
  const rawDiscount = formText(formData, "discountPercent", 12).replace(",", ".");
  const discountPercent = Number(rawDiscount || "0");

  if (!name || name.length > 120) {
    throw new CustomerAdminValidationError("Ingresá el nombre del cliente.");
  }
  if (!EMAIL_PATTERN.test(email) || email.length > 254) {
    throw new CustomerAdminValidationError("Ingresá un email válido.");
  }
  if (!PHONE_PATTERN.test(whatsapp)) {
    throw new CustomerAdminValidationError(
      "WhatsApp debe incluir código de país, por ejemplo +5493415551234.",
    );
  }
  if (!ACCOUNT_TYPES.has(rawAccountType as CustomerAccountType)) {
    throw new CustomerAdminValidationError("El tipo de cuenta no es válido.");
  }
  if (!PRICING_POLICIES.has(rawPolicy as CustomerPricingPolicy)) {
    throw new CustomerAdminValidationError("La política comercial no es válida.");
  }
  if (!ACCOUNT_STATUSES.has(rawStatus as AdminCustomerInput["status"])) {
    throw new CustomerAdminValidationError("El estado de la cuenta no es válido.");
  }

  const accountType = rawAccountType as CustomerAccountType;
  const pricingPolicy = rawPolicy as CustomerPricingPolicy;
  if (!coherentPolicy(accountType, pricingPolicy)) {
    throw new CustomerAdminValidationError(
      "El tipo de cuenta y la política comercial no son coherentes.",
    );
  }
  if (
    !Number.isFinite(discountPercent) ||
    (pricingPolicy === "CUSTOM_DISCOUNT"
      ? discountPercent <= 0 || discountPercent >= 100
      : discountPercent !== 0)
  ) {
    throw new CustomerAdminValidationError(
      pricingPolicy === "CUSTOM_DISCOUNT"
        ? "El descuento personalizado debe ser mayor a 0 y menor a 100."
        : "Sólo CUSTOM_DISCOUNT admite un porcentaje.",
    );
  }

  return {
    name,
    email,
    whatsapp,
    accountType,
    pricingPolicy,
    discountPercent,
    status: rawStatus as AdminCustomerInput["status"],
  };
}
