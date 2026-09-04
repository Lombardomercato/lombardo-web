import { z } from "zod";

export const pricingPolicySchema = z.enum([
  "RETAIL",
  "WHOLESALE",
  "BUSINESS",
  "CUSTOM_DISCOUNT",
]);

export const salesProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string().min(1),
  slug: z.string().min(1),
  href: z.string().startsWith("https://www.lombardomercato.com/productos/"),
  name: z.string().min(1),
  brand: z.string(),
  category: z.string(),
  categorySlug: z.string(),
  presentation: z.string(),
  description: z.string().nullable(),
  imageUrl: z.url().nullable(),
  price: z.number().positive(),
  basePrice: z.number().positive(),
  currency: z.literal("ARS"),
  pricingPolicy: pricingPolicySchema,
  discountPercent: z.number().min(0).max(99),
  availability: z.enum(["AVAILABLE_NOW", "SUPPLIER_AVAILABLE"]),
  stock: z.object({
    available: z.boolean(),
    quantity: z.number().int().nonnegative(),
  }),
  opportunity: z
    .object({
      referencePrice: z.number().positive(),
      startAt: z.string(),
      reviewAt: z.string(),
    })
    .nullable(),
});

export const productsPayloadSchema = z.object({
  products: z.array(salesProductSchema).max(24),
  count: z.number().int().nonnegative(),
});

export const selectionPayloadSchema = z.object({
  products: z.array(salesProductSchema).max(24),
  quantity: z.number().int().nonnegative(),
  total: z.number().nonnegative(),
  budget: z.number().positive(),
  withinBudget: z.boolean(),
});

export const guidePayloadSchema = z.object({
  guides: z.array(
    z.object({
      slug: z.string(),
      title: z.string(),
      description: z.string(),
      href: z.string().startsWith("/guias/"),
      matchedOn: z.array(z.string()).max(12),
    }),
  ).max(5),
});

export type SalesProduct = z.infer<typeof salesProductSchema>;

export const AI_AUDIT_EVENT_NAMES = [
  "chat_open",
  "chat_start",
  "chat_message",
  "tool_call",
  "recommendation_shown",
  "recommendation_click",
  "chat_add_to_cart",
  "chat_product_view",
  "chat_checkout_assist",
  "tool_error",
  "chat_error",
] as const;

export type AiEventName = (typeof AI_AUDIT_EVENT_NAMES)[number];

export const PUBLIC_AI_EVENT_NAMES = [
  "chat_open",
  "chat_message",
  "recommendation",
  "product_click",
  "add_to_cart",
] as const;

export type PublicAiEventName = (typeof PUBLIC_AI_EVENT_NAMES)[number];
