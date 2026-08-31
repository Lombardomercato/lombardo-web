import "server-only";

import { tool } from "ai";
import { z } from "zod";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { AiAuditStore } from "./audit-store";
import type { AiSalesConfiguration } from "./config";
import { callRuniaTool, type RuniaSalesToolName } from "./mcp-client";
import {
  guidePayloadSchema,
  productsPayloadSchema,
  salesProductSchema,
  selectionPayloadSchema,
} from "./types";

interface SalesToolsContext {
  configuration: AiSalesConfiguration;
  pricing: CustomerPricingContext;
  audit: AiAuditStore;
  chatId: string;
}

const occasionSchema = z.enum(["asado", "cena", "regalo", "brindis", "general"]);
const effectivePricePayloadSchema = z
  .object({
    productId: z.string().uuid(),
    price: z.number().positive(),
    basePrice: z.number().positive(),
    currency: z.literal("ARS"),
    pricingPolicy: z.enum(["RETAIL", "WHOLESALE", "BUSINESS", "CUSTOM_DISCOUNT"]),
    discountPercent: z.number().min(0).max(99),
  })
  .nullable();
const productPayloadSchema = z.object({ product: salesProductSchema.nullable() });

export function createSalesTools(context: SalesToolsContext) {
  const pricing = {
    policy: context.pricing.policy,
    discountPercent: context.pricing.discountPercent,
  };

  const invoke = async <T>(
    name: RuniaSalesToolName,
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ) => {
    try {
      const output = await callRuniaTool({
        configuration: context.configuration,
        name,
        arguments: name === "search_guides" ? args : { ...args, pricing },
        outputSchema: schema,
      });
      await safeAudit(context.audit, {
        chatId: context.chatId,
        pricing: context.pricing,
        eventName: "tool_call",
        source: "server",
        toolName: name,
      });
      return output;
    } catch (error) {
      await safeAudit(context.audit, {
        chatId: context.chatId,
        pricing: context.pricing,
        eventName: "tool_error",
        source: "server",
        toolName: name,
        metadata: { code: safeErrorCode(error) },
      });
      throw new Error("No pude consultar el catálogo en este momento.");
    }
  };

  return {
    search_products: tool({
      description: "Busca productos reales disponibles por nombre, marca o SKU. Usala para cualquier consulta concreta de catálogo.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(80),
        categorySlug: z.string().trim().max(40).optional(),
        maxPrice: z.number().positive().max(100_000_000).optional(),
        limit: z.number().int().min(1).max(8).default(5),
      }).strict(),
      execute: async (input) => ({
        kind: "products" as const,
        reason: `Coinciden con “${input.query}” y con el precio vigente de tu sesión.`,
        ...(await invoke("search_products", input, productsPayloadSchema)),
      }),
    }),
    get_product: tool({
      description: "Obtiene un producto real por UUID o SKU cuando necesitás verificar sus datos vigentes.",
      inputSchema: z.object({
        productId: z.string().uuid().optional(),
        sku: z.string().trim().min(2).max(80).optional(),
      }).strict().refine((input) => Boolean(input.productId || input.sku), "Indicá productId o sku"),
      execute: async (input) => ({
        kind: "product" as const,
        ...(await invoke("get_product", input, productPayloadSchema)),
      }),
    }),
    recommend_products: tool({
      description: "Recomienda productos reales según ocasión, preferencia y presupuesto. Usala antes de responder recomendaciones.",
      inputSchema: z.object({
        occasion: occasionSchema,
        preferences: z.string().trim().max(80).optional(),
        categorySlug: z.string().trim().max(40).optional(),
        maxPrice: z.number().positive().max(100_000_000).optional(),
        limit: z.number().int().min(1).max(6).default(4),
      }).strict(),
      execute: async (input) => ({
        kind: "products" as const,
        reason: recommendationReason(input.occasion, input.maxPrice),
        ...(await invoke("recommend_products", input, productsPayloadSchema)),
      }),
    }),
    get_effective_price: tool({
      description: "Revalida el precio efectivo actual para la política comercial autenticada de esta sesión.",
      inputSchema: z.object({ productId: z.string().uuid() }).strict(),
      execute: async (input) => ({
        kind: "price" as const,
        price: await invoke("get_effective_price", input, effectivePricePayloadSchema),
      }),
    }),
    get_opportunities: tool({
      description: "Busca únicamente oportunidades comerciales reales y vigentes del catálogo.",
      inputSchema: z.object({
        categorySlug: z.string().trim().max(40).optional(),
        maxPrice: z.number().positive().max(100_000_000).optional(),
        limit: z.number().int().min(1).max(8).default(5),
      }).strict(),
      execute: async (input) => ({
        kind: "products" as const,
        reason: "Son oportunidades vigentes verificadas por Lombardo.",
        ...(await invoke("get_opportunities", input, productsPayloadSchema)),
      }),
    }),
    search_guides: tool({
      description: "Busca guías editoriales publicadas por Lombardo para aportar criterio sin inventar información de productos.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(3).default(2),
      }).strict(),
      execute: async (input) => ({
        kind: "guides" as const,
        ...(await invoke("search_guides", input, guidePayloadSchema)),
      }),
    }),
    build_selection: tool({
      description: "Arma una selección de varias unidades reales sin superar un presupuesto total.",
      inputSchema: z.object({
        quantity: z.number().int().min(2).max(24),
        totalBudget: z.number().positive().max(100_000_000),
        occasion: occasionSchema.default("general"),
        categorySlug: z.string().trim().max(40).optional(),
      }).strict(),
      execute: async (input) => ({
        kind: "selection" as const,
        reason: `Selección calculada para ${input.quantity} unidades y un tope total de ARS ${Math.round(input.totalBudget).toLocaleString("es-AR")}.`,
        ...(await invoke("build_selection", input, selectionPayloadSchema)),
      }),
    }),
  };
}

async function safeAudit(
  audit: AiAuditStore,
  input: Parameters<AiAuditStore["recordEvent"]>[0],
) {
  await audit.recordEvent(input).catch(() => undefined);
}

function recommendationReason(occasion: string, maxPrice?: number) {
  const budget = maxPrice
    ? ` dentro de un tope de ARS ${Math.round(maxPrice).toLocaleString("es-AR")}`
    : "";
  return `Los elegí para ${occasion === "general" ? "una compra versátil" : occasion}${budget}.`;
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  return error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase();
}
