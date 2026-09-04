import "server-only";

import { createHash } from "node:crypto";
import { z } from "zod";

import { commerceProvider } from "@/lib/commerce";
import { requiresDeliveryAddress } from "@/lib/checkout/delivery-methods";
import { formatCurrency } from "@/lib/utils/format-currency";
import { createCheckoutCoordinator } from "@/lib/server/services";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { VerifiedWhatsAppCustomer } from "@/lib/server/customers/whatsapp-pricing";
import type { CheckoutCustomer, CreateOrderInput, DeliveryMethod, InvoiceDetails } from "@/types/checkout";
import type { Product } from "@/types/commerce";

import { searchCatalog } from "./tools";

const cartLineSchema = z.object({
  productId: z.string().uuid(),
  sku: z.string().trim().min(1).max(80),
  name: z.string().trim().min(1).max(240),
  slug: z.string().trim().min(1).max(320),
  presentation: z.string().trim().max(120),
  quantity: z.number().int().min(1).max(99),
  effectiveUnitPrice: z.number().positive(),
  lineTotal: z.number().positive(),
}).strict();

const cartSchema = z.object({
  items: z.array(cartLineSchema).max(50).default([]),
  total: z.number().nonnegative().default(0),
  currency: z.literal("ARS").default("ARS"),
  pricingPolicy: z.enum(["RETAIL", "WHOLESALE", "BUSINESS", "CUSTOM_DISCOUNT"]).default("RETAIL"),
}).strict();

const deliveryMethodSchema = z.enum(["PICKUP", "DELIVERY_ROSARIO", "DELIVERY_SOUTH"]);
const deliveryServiceSchema = z.enum(["standard", "priority"]);
const paymentMethodSchema = z.enum(["mercado_pago", "bank_transfer", "cash"]);

const checkoutSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().max(254).optional(),
  city: z.string().trim().max(100).optional(),
  deliveryMethod: deliveryMethodSchema.optional(),
  deliveryService: deliveryServiceSchema.optional(),
  street: z.string().trim().max(160).optional(),
  number: z.string().trim().max(30).optional(),
  floorApartment: z.string().trim().max(80).optional(),
  province: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
  references: z.string().trim().max(500).optional(),
  paymentMethod: paymentMethodSchema.optional(),
  invoiceRequested: z.boolean().optional(),
  businessName: z.string().trim().max(160).optional(),
  cuit: z.string().trim().max(20).optional(),
  taxCondition: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(2_000).optional(),
  couponCode: z.string().trim().max(40).optional(),
}).strict();

function parseJsonTemplate(value: unknown) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const cartInputSchema = z.preprocess(parseJsonTemplate, cartSchema);
const checkoutInputSchema = z.preprocess(parseJsonTemplate, checkoutSchema);

export const whatsappCommerceOperationSchema = z.enum([
  "manage_whatsapp_cart",
  "update_whatsapp_checkout",
  "confirm_whatsapp_order",
  "register_whatsapp_payment_proof",
  "get_whatsapp_order_status",
]);

export type WhatsAppCommerceOperation = z.infer<typeof whatsappCommerceOperationSchema>;

export const whatsappCommerceInputSchemas = {
  manage_whatsapp_cart: z.object({
    action: z.enum(["add", "remove", "set_quantity", "summary", "clear"]),
    cart: cartInputSchema.optional(),
    productId: z.string().uuid().optional(),
    query: z.string().trim().max(500).optional(),
    quantity: z.number().int().min(1).max(99).optional(),
  }).strict(),
  update_whatsapp_checkout: z.object({
    checkout: checkoutInputSchema.optional(),
    firstName: z.string().trim().max(100).optional(),
    lastName: z.string().trim().max(100).optional(),
    email: z.string().trim().max(254).optional(),
    city: z.string().trim().max(100).optional(),
    deliveryMethod: deliveryMethodSchema.optional(),
    deliveryService: deliveryServiceSchema.optional(),
    street: z.string().trim().max(160).optional(),
    number: z.string().trim().max(30).optional(),
    floorApartment: z.string().trim().max(80).optional(),
    province: z.string().trim().max(100).optional(),
    postalCode: z.string().trim().max(20).optional(),
    references: z.string().trim().max(500).optional(),
    paymentMethod: paymentMethodSchema.optional(),
    invoiceRequested: z.boolean().optional(),
    businessName: z.string().trim().max(160).optional(),
    cuit: z.string().trim().max(20).optional(),
    taxCondition: z.string().trim().max(120).optional(),
    notes: z.string().trim().max(2_000).optional(),
    couponCode: z.string().trim().max(40).optional(),
  }).strict(),
  confirm_whatsapp_order: z.object({
    cart: cartInputSchema,
    checkout: checkoutInputSchema,
    confirmed: z.literal(true),
  }).strict(),
  register_whatsapp_payment_proof: z.object({
    attachmentUrl: z.string().url().max(2_000),
    mimeType: z.string().trim().max(120),
  }).strict(),
  get_whatsapp_order_status: z.object({}).strict(),
} as const;

export interface WhatsAppCommerceContext {
  pricing: CustomerPricingContext;
  verifiedCustomer: VerifiedWhatsAppCustomer | null;
  sessionId: string;
  senderPhone: string;
  contactId?: string;
}

export async function executeWhatsAppCommerceOperation(
  context: WhatsAppCommerceContext,
  operation: WhatsAppCommerceOperation,
  rawInput: unknown,
) {
  if (operation === "manage_whatsapp_cart") {
    const input = whatsappCommerceInputSchemas.manage_whatsapp_cart.parse(rawInput);
    return manageCart(context.pricing, input);
  }
  if (operation === "update_whatsapp_checkout") {
    const input = whatsappCommerceInputSchemas.update_whatsapp_checkout.parse(rawInput);
    return updateCheckout(context, input);
  }
  if (operation === "register_whatsapp_payment_proof") {
    const input = whatsappCommerceInputSchemas.register_whatsapp_payment_proof.parse(rawInput);
    return registerPaymentProof(context, input);
  }
  if (operation === "get_whatsapp_order_status") {
    whatsappCommerceInputSchemas.get_whatsapp_order_status.parse(rawInput);
    return getOrderStatus(context);
  }
  const input = whatsappCommerceInputSchemas.confirm_whatsapp_order.parse(rawInput);
  return confirmOrder(context, input.cart, input.checkout);
}

async function manageCart(
  pricing: CustomerPricingContext,
  input: z.infer<typeof whatsappCommerceInputSchemas.manage_whatsapp_cart>,
) {
  if (input.action === "clear") return cartResult("updated", [], pricing);
  const current = await repriceCart(input.cart?.items ?? [], pricing);
  if (input.action === "summary") return cartResult("summary", current, pricing);

  if (input.action === "remove") {
    if (!input.productId) throw new Error("WHATSAPP_CART_PRODUCT_REQUIRED");
    return cartResult("updated", current.filter((line) => line.productId !== input.productId), pricing);
  }
  if (input.action === "set_quantity") {
    if (!input.productId || !input.quantity) throw new Error("WHATSAPP_CART_QUANTITY_REQUIRED");
    if (!current.some((line) => line.productId === input.productId)) throw new Error("WHATSAPP_CART_PRODUCT_NOT_FOUND");
    return cartResult("updated", current.map((line) => line.productId === input.productId
      ? { ...line, quantity: input.quantity!, lineTotal: round(line.effectiveUnitPrice * input.quantity!) }
      : line), pricing);
  }

  const candidates = input.productId
    ? await commerceProvider.getProductsByIds([input.productId], pricing)
    : input.query
      ? await searchCatalog({ query: input.query, limit: 5, pricing })
      : [];
  if (!candidates.length) return { ...cartResult("not_found", current, pricing), alternatives: [] };
  if (!input.productId && candidates.length > 1) {
    return {
      ...cartResult("needs_selection", current, pricing),
      alternatives: candidates.slice(0, 5).map(productChoice),
    };
  }
  const product = candidates[0];
  const quantity = input.quantity ?? 1;
  assertAvailable(product, quantity);
  const existing = current.find((line) => line.productId === product.id);
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  assertAvailable(product, nextQuantity);
  const next = current.filter((line) => line.productId !== product.id);
  next.push(toCartLine(product, nextQuantity));
  return cartResult("updated", next, pricing);
}

async function repriceCart(
  lines: z.infer<typeof cartLineSchema>[],
  pricing: CustomerPricingContext,
) {
  if (!lines.length) return [];
  const products = await commerceProvider.getProductsByIds(lines.map((line) => line.productId), pricing);
  const byId = new Map(products.map((product) => [product.id, product]));
  return lines.map((line) => {
    const product = byId.get(line.productId);
    if (!product) throw new Error("WHATSAPP_CART_PRODUCT_NOT_FOUND");
    assertAvailable(product, line.quantity);
    return toCartLine(product, line.quantity);
  });
}

function assertAvailable(product: Product, quantity: number) {
  if (!product.active || product.availability === "UNAVAILABLE") throw new Error("WHATSAPP_CART_PRODUCT_UNAVAILABLE");
  if (product.availability === "AVAILABLE_NOW" && (!product.stock.available || product.stock.quantity < quantity)) {
    throw new Error("WHATSAPP_CART_STOCK_UNCERTAIN");
  }
}

function toCartLine(product: Product, quantity: number) {
  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    slug: product.slug,
    presentation: product.presentation,
    quantity,
    effectiveUnitPrice: product.price,
    lineTotal: round(product.price * quantity),
  };
}

function productChoice(product: Product) {
  return {
    productId: product.id,
    name: product.name,
    presentation: product.presentation,
    effectiveUnitPrice: product.price,
    currency: "ARS" as const,
    href: `https://www.lombardomercato.com/productos/${product.slug}`,
  };
}

function cartResult(status: string, items: ReturnType<typeof toCartLine>[], pricing: CustomerPricingContext) {
  return {
    status,
    cart: {
      items,
      total: round(items.reduce((sum, item) => sum + item.lineTotal, 0)),
      currency: "ARS" as const,
      pricingPolicy: pricing.policy,
    },
  };
}

function updateCheckout(
  context: WhatsAppCommerceContext,
  input: z.infer<typeof whatsappCommerceInputSchemas.update_whatsapp_checkout>,
) {
  const { checkout: current, ...updates } = input;
  const knownName = splitName(context.verifiedCustomer?.name ?? "");
  const checkout = checkoutSchema.parse(compact({
    ...(current ?? {}),
    firstName: current?.firstName || knownName.firstName,
    lastName: current?.lastName ?? knownName.lastName,
    email: current?.email || context.verifiedCustomer?.email || undefined,
    phone: normalizePhone(context.senderPhone),
    ...updates,
  }));
  if (checkout.city && !checkout.deliveryMethod) checkout.deliveryMethod = deliveryForCity(checkout.city);
  checkout.deliveryService ||= "standard";
  if (checkout.deliveryService === "priority" && checkout.deliveryMethod !== "DELIVERY_ROSARIO") {
    throw new Error("PRIORITY_DELIVERY_ONLY_ROSARIO");
  }
  if (checkout.deliveryMethod && checkout.deliveryMethod !== "PICKUP") checkout.province ||= "Santa Fe";
  return {
    status: "updated",
    checkout,
    nextMissingField: nextMissingField(checkout),
    pricingPolicy: context.pricing.policy,
    verifiedCustomer: Boolean(context.verifiedCustomer),
  };
}

async function confirmOrder(
  context: WhatsAppCommerceContext,
  cart: z.infer<typeof cartSchema>,
  checkout: z.infer<typeof checkoutSchema>,
) {
  const missing = nextMissingField(checkout);
  if (missing) return { status: "incomplete", nextMissingField: missing, checkout };
  if (!cart.items.length) throw new Error("WHATSAPP_CART_EMPTY");
  const paymentMethod = checkout.paymentMethod!;
  const customer: CheckoutCustomer = {
    firstName: checkout.firstName!,
    lastName: checkout.lastName ?? "",
    whatsapp: normalizePhone(context.senderPhone),
    email: checkout.email ?? "",
  };
  const deliveryMethod = checkout.deliveryMethod! as DeliveryMethod;
  const invoiceDetails: InvoiceDetails | undefined = checkout.invoiceRequested ? {
    type: "A",
    businessName: checkout.businessName!,
    cuit: checkout.cuit!.replace(/\D/g, ""),
    taxCondition: checkout.taxCondition,
  } : undefined;
  const key = createHash("sha256")
    .update(JSON.stringify({ sessionId: context.sessionId, cart, checkout }))
    .digest("hex");
  const input: CreateOrderInput = {
    checkoutSessionId: `wa_${key.slice(0, 48)}`,
    idempotencyKey: `wa_order_${key}`,
    items: cart.items.map((item) => ({
      productId: item.productId,
      quantity: item.quantity,
      expectedUnitPrice: item.effectiveUnitPrice,
    })),
    customer,
    deliveryMethod,
    deliveryService: checkout.deliveryService ?? "standard",
    deliveryAddress: requiresDeliveryAddress(deliveryMethod) ? {
      street: checkout.street!,
      number: checkout.number!,
      city: checkout.city!,
      province: checkout.province ?? "Santa Fe",
      floorApartment: checkout.floorApartment,
      postalCode: checkout.postalCode,
      references: checkout.references,
    } : undefined,
    couponCode: checkout.couponCode,
    paymentMethod,
    orderSource: "whatsapp",
    channelContext: {
      channel: "whatsapp",
      conversationSessionId: context.sessionId,
      contactId: context.contactId,
    },
    invoiceDetails,
    customerNotes: checkout.notes,
  };
  const { coordinator } = createCheckoutCoordinator(context.pricing);
  const result = await coordinator.createOrder(input);
  return {
    status: "confirmed",
    order: {
      publicId: result.order.publicId,
      displayId: result.order.publicId.slice(0, 8).toLocaleUpperCase("es-AR"),
      items: result.order.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        effectiveUnitPrice: item.unitPrice,
        lineTotal: item.lineTotal,
      })),
      total: result.order.total,
      totalFormatted: formatCurrency(result.order.total),
      currency: result.order.currency,
      deliveryMethod: result.order.deliveryMethod,
      deliveryService: result.order.deliveryService,
      deliveryCost: result.order.deliveryCost,
      paymentMethod: result.order.paymentMethod,
      paymentStatus: result.order.paymentStatus,
      pricingPolicy: result.order.pricingPolicy,
      reused: result.reused,
    },
    paymentLink: result.payment?.checkoutUrl ?? null,
    paymentError: result.paymentError?.message ?? null,
    trackingLink: trackingLink(result.order.publicId),
  };
}

async function registerPaymentProof(
  context: WhatsAppCommerceContext,
  input: z.infer<typeof whatsappCommerceInputSchemas.register_whatsapp_payment_proof>,
) {
  const url = new URL(input.attachmentUrl);
  if (url.protocol !== "https:") throw new Error("WHATSAPP_PAYMENT_PROOF_URL_INVALID");
  if (!(input.mimeType.startsWith("image/") || input.mimeType === "application/pdf")) {
    throw new Error("WHATSAPP_PAYMENT_PROOF_TYPE_INVALID");
  }
  const { tenantId, store } = createCheckoutCoordinator(context.pricing);
  const order = await store.getByConversationSession(tenantId, context.sessionId);
  if (!order) throw new Error("WHATSAPP_ORDER_NOT_FOUND");
  if (order.paymentMethod !== "bank_transfer" || order.paymentStatus !== "pending") {
    throw new Error("WHATSAPP_PAYMENT_PROOF_NOT_APPLICABLE");
  }
  const proof = await store.registerPaymentProof({
    tenantId,
    orderId: order.id,
    conversationSessionId: context.sessionId,
    sourceUrl: url.toString(),
    mimeType: input.mimeType,
  });
  return {
    status: "proof_pending_review",
    reviewLabel: "REVISAR COMPROBANTE",
    paymentStatus: order.paymentStatus,
    proofId: proof.id,
    order: {
      publicId: order.publicId,
      displayId: order.publicId.slice(0, 8).toUpperCase(),
    },
    trackingLink: trackingLink(order.publicId),
    handoffRequired: true,
    handoffReason: "REVISAR COMPROBANTE",
  };
}

async function getOrderStatus(context: WhatsAppCommerceContext) {
  const { tenantId, store } = createCheckoutCoordinator(context.pricing);
  const order = await store.getByConversationSession(tenantId, context.sessionId);
  if (!order) return { status: "not_found" };
  return {
    status: "found",
    order: {
      publicId: order.publicId,
      displayId: order.publicId.slice(0, 8).toUpperCase(),
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      total: order.total,
      totalFormatted: formatCurrency(order.total),
    },
    trackingLink: trackingLink(order.publicId),
  };
}

function trackingLink(publicId: string) {
  const configured = process.env.APP_URL?.trim();
  try {
    const url = new URL(configured || "https://www.lombardomercato.com");
    if (url.protocol !== "https:") throw new Error("invalid origin");
    return new URL(`/pedido/${encodeURIComponent(publicId)}`, url.origin).toString();
  } catch {
    return `https://www.lombardomercato.com/pedido/${encodeURIComponent(publicId)}`;
  }
}

function nextMissingField(checkout: z.infer<typeof checkoutSchema>) {
  if (!checkout.firstName) return "name";
  if (!checkout.phone) return "phone";
  if (!checkout.deliveryMethod) return "delivery_method";
  if (checkout.deliveryMethod !== "PICKUP" && !checkout.city) return "city";
  if (checkout.deliveryMethod !== "PICKUP" && !checkout.street) return "street";
  if (checkout.deliveryMethod !== "PICKUP" && !checkout.number) return "street_number";
  if (!checkout.paymentMethod) return "payment_method";
  if (checkout.paymentMethod === "mercado_pago" && !validEmail(checkout.email)) return "email";
  if (checkout.invoiceRequested === undefined) return "invoice_a";
  if (checkout.invoiceRequested && !checkout.businessName) return "business_name";
  if (checkout.invoiceRequested && !/^\d{11}$/.test((checkout.cuit ?? "").replace(/\D/g, ""))) return "cuit";
  return null;
}

function deliveryForCity(city: string): z.infer<typeof deliveryMethodSchema> | undefined {
  const normalized = normalize(city);
  if (normalized === "rosario") return "DELIVERY_ROSARIO";
  if (["pueblo esther", "lagos", "alvear"].includes(normalized)) return "DELIVERY_SOUTH";
  return undefined;
}

function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return { firstName: parts.shift(), lastName: parts.join(" ") || undefined };
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return `+${digits}`;
}

function validEmail(value?: string) {
  return Boolean(value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value));
}

function compact<T extends Record<string, unknown>>(value: T) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== "" && entry !== null && entry !== undefined));
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es-AR");
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
