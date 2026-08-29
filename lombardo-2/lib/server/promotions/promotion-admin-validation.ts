import type { AdminPromotionInput } from "@/lib/server/admin/types";

export class PromotionAdminValidationError extends Error {}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(form: FormData, key: string, max: number) {
  const value = form.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function positiveNumber(form: FormData, key: string, optional = false) {
  const raw = text(form, key, 30).replace(",", ".");
  if (!raw && optional) return undefined;
  const value = Number(raw || "0");
  if (!Number.isFinite(value) || value <= 0) throw new PromotionAdminValidationError(`Revisá ${key}.`);
  return value;
}

function positiveInteger(form: FormData, key: string) {
  const value = positiveNumber(form, key, true);
  if (value !== undefined && !Number.isInteger(value)) throw new PromotionAdminValidationError(`Revisá ${key}.`);
  return value;
}

function list(form: FormData, key: string) {
  return [...new Set(text(form, key, 5000).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean))];
}

function dateValue(form: FormData, key: string) {
  const raw = text(form, key, 40);
  if (!raw) return undefined;
  const value = new Date(raw);
  if (Number.isNaN(value.getTime())) throw new PromotionAdminValidationError("Revisá las fechas.");
  return value.toISOString();
}

export function parseAdminPromotionInput(form: FormData): AdminPromotionInput {
  const code = text(form, "code", 40).toLocaleUpperCase("en-US");
  const name = text(form, "name", 160);
  const description = text(form, "description", 2000);
  const status = text(form, "status", 10);
  const discountType = text(form, "discountType", 20);
  const discountValue = positiveNumber(form, "discountValue")!;
  const appliesTo = text(form, "appliesTo", 20);
  const customerScope = text(form, "customerScope", 30);
  const startAt = dateValue(form, "startAt");
  const endAt = dateValue(form, "endAt");
  const minimumRaw = text(form, "minimumOrderAmount", 30).replace(",", ".");
  const minimumOrderAmount = Number(minimumRaw || "0");
  const productIds = list(form, "productIds");
  const categorySlugs = list(form, "categorySlugs").map((slug) => slug.toLocaleLowerCase("en-US"));
  const customerAccountIds = list(form, "customerAccountIds");

  if (!/^[A-Z0-9][A-Z0-9_-]{2,39}$/.test(code) || !name) throw new PromotionAdminValidationError("Revisá el código y el nombre.");
  if (status !== "ACTIVE" && status !== "INACTIVE") throw new PromotionAdminValidationError("Estado inválido.");
  if (discountType !== "PERCENTAGE" && discountType !== "FIXED_AMOUNT") throw new PromotionAdminValidationError("Tipo de descuento inválido.");
  if (discountType === "PERCENTAGE" && discountValue >= 100) throw new PromotionAdminValidationError("El porcentaje debe ser menor a 100.");
  if (!Number.isFinite(minimumOrderAmount) || minimumOrderAmount < 0) throw new PromotionAdminValidationError("La compra mínima no es válida.");
  if (startAt && endAt && new Date(endAt) <= new Date(startAt)) throw new PromotionAdminValidationError("El vencimiento debe ser posterior al inicio.");
  if (!(["ALL", "PRODUCTS", "CATEGORIES"] as string[]).includes(appliesTo)) throw new PromotionAdminValidationError("Alcance de productos inválido.");
  if (!(["ALL", "RETAIL", "WHOLESALE", "BUSINESS", "CUSTOM", "SPECIFIC_CUSTOMERS"] as string[]).includes(customerScope)) throw new PromotionAdminValidationError("Alcance de clientes inválido.");
  if (productIds.some((id) => !UUID.test(id)) || customerAccountIds.some((id) => !UUID.test(id))) throw new PromotionAdminValidationError("Los IDs indicados no son válidos.");
  if (categorySlugs.some((slug) => !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))) throw new PromotionAdminValidationError("Las categorías no son válidas.");
  if (appliesTo === "PRODUCTS" && !productIds.length) throw new PromotionAdminValidationError("Indicá al menos un producto.");
  if (appliesTo === "CATEGORIES" && !categorySlugs.length) throw new PromotionAdminValidationError("Indicá al menos una categoría.");
  if (customerScope === "SPECIFIC_CUSTOMERS" && !customerAccountIds.length) throw new PromotionAdminValidationError("Indicá al menos un cliente.");

  return {
    code, name, description,
    status: status as AdminPromotionInput["status"],
    discountType: discountType as AdminPromotionInput["discountType"],
    discountValue,
    startAt, endAt,
    minimumOrderAmount,
    maxTotalUses: positiveInteger(form, "maxTotalUses"),
    maxUsesPerCustomer: positiveInteger(form, "maxUsesPerCustomer"),
    appliesTo: appliesTo as AdminPromotionInput["appliesTo"],
    customerScope: customerScope as AdminPromotionInput["customerScope"],
    stackable: form.get("stackable") === "on",
    firstOrderOnly: form.get("firstOrderOnly") === "on",
    productIds: appliesTo === "PRODUCTS" ? productIds : [],
    categorySlugs: appliesTo === "CATEGORIES" ? categorySlugs : [],
    customerAccountIds: customerScope === "SPECIFIC_CUSTOMERS" ? customerAccountIds : [],
  };
}
