import "server-only";

import { tool } from "ai";
import { z } from "zod";
import { commerceProvider, quickOrderProvider } from "@/lib/commerce";
import { getGuide, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { loadGuideProducts } from "@/lib/seo/guide-products";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { Product } from "@/types/commerce";
import type { AiAuditStore } from "./audit-store";
import type { AiSalesConfiguration } from "./config";
import type { SalesProduct } from "./types";

export interface SalesToolsContext {
  configuration: AiSalesConfiguration;
  pricing: CustomerPricingContext;
  audit: AiAuditStore;
  chatId: string;
}

const occasionSchema = z.enum(["asado", "cena", "regalo", "brindis", "general"]);
const categorySchema = z.string().trim().min(1).max(40).optional();
const priceSchema = z.number().positive().max(100_000_000).optional();
export const commerceOperationNameSchema = z.enum([
  "search_products",
  "get_product",
  "recommend_products",
  "get_effective_price",
  "get_opportunities",
  "search_guides",
  "build_selection",
]);

export type CommerceOperationName = z.infer<typeof commerceOperationNameSchema>;

export const commerceOperationInputSchemas = {
  search_products: z.object({
    query: z.string().trim().max(80).default(""),
    categorySlug: categorySchema,
    maxPrice: priceSchema,
    limit: z.number().int().min(1).max(8).default(5),
  }).strict(),
  get_product: z.object({
    productId: z.string().uuid().optional(),
    sku: z.string().trim().min(2).max(80).optional(),
  }).strict().refine((input) => Boolean(input.productId || input.sku), "Indicá productId o sku"),
  recommend_products: z.object({
    occasion: occasionSchema,
    preferences: z.string().trim().max(80).optional(),
    categorySlug: categorySchema,
    maxPrice: priceSchema,
    limit: z.number().int().min(1).max(6).default(4),
  }).strict(),
  get_effective_price: z.object({ productId: z.string().uuid() }).strict(),
  get_opportunities: z.object({
    categorySlug: categorySchema,
    maxPrice: priceSchema,
    limit: z.number().int().min(1).max(8).default(5),
  }).strict(),
  search_guides: z.object({
    query: z.string().trim().min(2).max(120),
    limit: z.number().int().min(1).max(3).default(2),
  }).strict(),
  build_selection: z.object({
    quantity: z.number().int().min(2).max(24),
    totalBudget: z.number().positive().max(100_000_000),
    occasion: occasionSchema.default("general"),
    categorySlug: categorySchema,
  }).strict(),
} as const;
const CATALOG_PAGE_SIZE = 48;
const MAX_SCAN_PAGES = 16;

export function createSalesTools(context: SalesToolsContext) {
  const execute = async <T>(name: string, action: () => Promise<T>) => {
    try {
      return await action();
    } catch (error) {
      console.error("Lombardo commerce function failed", {
        tool: name,
        code: safeErrorCode(error),
      });
      throw new Error("No pude consultar el catálogo en este momento.");
    }
  };

  return {
    search_products: tool({
      description: "Busca productos reales del catálogo por nombre, marca o código. También permite filtrar categoría y precio efectivo.",
      inputSchema: commerceOperationInputSchemas.search_products,
      execute: (input) => execute("search_products", () => executeCommerceOperation(context, "search_products", input)),
    }),

    get_product: tool({
      description: "Obtiene un producto real por identificador y devuelve sus datos vigentes.",
      inputSchema: commerceOperationInputSchemas.get_product,
      execute: (input) => execute("get_product", () => executeCommerceOperation(context, "get_product", input)),
    }),

    recommend_products: tool({
      description: "Elige productos reales para una ocasión o presupuesto. Usala para asados, regalos y búsquedas generales por precio.",
      inputSchema: commerceOperationInputSchemas.recommend_products,
      execute: (input) => execute("recommend_products", () => executeCommerceOperation(context, "recommend_products", input)),
    }),

    get_effective_price: tool({
      description: "Revalida el precio efectivo de un producto para la identidad autenticada de esta sesión.",
      inputSchema: commerceOperationInputSchemas.get_effective_price,
      execute: (input) => execute("get_effective_price", () => executeCommerceOperation(context, "get_effective_price", input)),
    }),

    get_opportunities: tool({
      description: "Obtiene oportunidades reales y vigentes del catálogo Lombardo.",
      inputSchema: commerceOperationInputSchemas.get_opportunities,
      execute: (input) => execute("get_opportunities", () => executeCommerceOperation(context, "get_opportunities", input)),
    }),

    search_guides: tool({
      description: "Busca guías editoriales publicadas por Lombardo para aportar criterio de elección.",
      inputSchema: commerceOperationInputSchemas.search_guides,
      execute: (input) => execute("search_guides", () => executeCommerceOperation(context, "search_guides", input)),
    }),

    build_selection: tool({
      description: "Arma una selección de varias botellas sin superar un presupuesto total real.",
      inputSchema: commerceOperationInputSchemas.build_selection,
      execute: (input) => execute("build_selection", () => executeCommerceOperation(context, "build_selection", input)),
    }),
  };
}

export async function executeCommerceOperation(
  context: SalesToolsContext,
  operation: CommerceOperationName,
  rawInput: unknown,
): Promise<unknown> {
  if (operation === "search_products") {
    const input = commerceOperationInputSchemas.search_products.parse(rawInput);
    const products = await searchCatalog({ ...input, pricing: context.pricing });
    return {
      kind: "products" as const,
      reason: input.query
        ? `Resultados reales para “${input.query}”. ${pricingNotice(context.pricing)}`
        : `Productos reales dentro de los filtros. ${pricingNotice(context.pricing)}`,
      products: products.map(toSalesProduct),
      count: products.length,
    };
  }

  if (operation === "get_product") {
    const input = commerceOperationInputSchemas.get_product.parse(rawInput);
    let product: Product | undefined;
    if (input.productId) {
      product = (await commerceProvider.getProductsByIds([input.productId], context.pricing))[0];
    } else if (input.sku) {
      const matches = await searchCatalog({ query: input.sku, limit: 8, pricing: context.pricing });
      product = matches.find((candidate) => candidate.sku.toLocaleLowerCase("es-AR") === input.sku!.toLocaleLowerCase("es-AR")) ?? matches[0];
    }
    return { kind: "product" as const, product: product ? toSalesProduct(product) : null };
  }

  if (operation === "recommend_products") {
    const input = commerceOperationInputSchemas.recommend_products.parse(rawInput);
    const products = await recommendations({ ...input, pricing: context.pricing });
    return {
      kind: "products" as const,
      reason: `${recommendationReason(input.occasion, input.maxPrice)} ${pricingNotice(context.pricing)}`,
      products: products.map(toSalesProduct),
      count: products.length,
    };
  }

  if (operation === "get_effective_price") {
    const input = commerceOperationInputSchemas.get_effective_price.parse(rawInput);
    const product = (await commerceProvider.getProductsByIds([input.productId], context.pricing))[0];
    return {
      kind: "price" as const,
      price: product ? {
        productId: product.id,
        price: product.price,
        basePrice: product.basePrice,
        currency: "ARS" as const,
        pricingPolicy: product.pricingPolicy,
        discountPercent: product.discountPercent,
      } : null,
    };
  }

  if (operation === "get_opportunities") {
    const input = commerceOperationInputSchemas.get_opportunities.parse(rawInput);
    const products = (await commerceProvider.getActiveOpportunities(48, context.pricing))
      .filter((product) => matchesFilters(product, input.categorySlug, input.maxPrice))
      .slice(0, input.limit);
    return {
      kind: "products" as const,
      reason: `Son oportunidades reales y vigentes verificadas por Lombardo. ${pricingNotice(context.pricing)}`,
      products: products.map(toSalesProduct),
      count: products.length,
    };
  }

  if (operation === "search_guides") {
    const input = commerceOperationInputSchemas.search_guides.parse(rawInput);
    return {
      kind: "guides" as const,
      guides: searchGuides(input.query, input.limit),
    };
  }

  const input = commerceOperationInputSchemas.build_selection.parse(rawInput);
  const candidates = await scanCatalog({
    categorySlug: input.categorySlug ?? "vinos",
    maxPrice: input.totalBudget,
    pricing: context.pricing,
  });
  const products = cheapestDiverseSelection(candidates, input.quantity);
  const total = products.reduce((sum, product) => sum + product.price, 0);
  return {
    kind: "selection" as const,
    reason: `Selección calculada con precios vigentes para ${input.quantity} unidades y un tope total de ${formatArs(input.totalBudget)}. Total: ${formatArs(total)}. ${pricingNotice(context.pricing)}`,
    products: products.map(toSalesProduct),
    quantity: products.length,
    total,
    budget: input.totalBudget,
    withinBudget: products.length === input.quantity && total <= input.totalBudget,
  };
}

async function searchCatalog(input: {
  query: string;
  categorySlug?: string;
  maxPrice?: number;
  limit: number;
  pricing: CustomerPricingContext;
}) {
  if (!input.query) return (await scanCatalog(input)).slice(0, input.limit);

  const quick = await quickOrderProvider.searchProducts(
    { search: input.query, limit: Math.min(Math.max(input.limit * 3, 12), 30) },
    input.pricing,
  );
  const hydrated = await commerceProvider.getProductsByIds(
    quick.products.map((entry) => entry.product.id),
    input.pricing,
  );
  return hydrated
    .filter((product) => matchesFilters(product, input.categorySlug, input.maxPrice))
    .slice(0, input.limit);
}

async function recommendations(input: {
  occasion: z.infer<typeof occasionSchema>;
  preferences?: string;
  categorySlug?: string;
  maxPrice?: number;
  limit: number;
  pricing: CustomerPricingContext;
}) {
  const preferred = input.preferences
    ? await searchCatalog({
        query: input.preferences,
        categorySlug: input.categorySlug,
        maxPrice: input.maxPrice,
        limit: input.limit,
        pricing: input.pricing,
      })
    : [];
  const guideSlug = {
    asado: "vino-para-asado-no-siempre-malbec",
    cena: "que-vino-llevar-a-una-cena",
    regalo: "regalar-vino-sin-saber-de-vino",
    brindis: null,
    general: null,
  }[input.occasion];
  const guide = guideSlug ? getGuide(guideSlug) : null;
  const guided = guide ? await loadGuideProducts(guide, input.pricing) : [];
  const fallback = await scanCatalog({
    categorySlug: input.categorySlug ?? (input.occasion === "brindis" ? "espumantes" : "vinos"),
    maxPrice: input.maxPrice,
    pricing: input.pricing,
  });

  return diverseProducts([...preferred, ...guided, ...fallback])
    .filter((product) => matchesFilters(product, input.categorySlug, input.maxPrice))
    .slice(0, input.limit);
}

async function scanCatalog(input: {
  categorySlug?: string;
  maxPrice?: number;
  pricing: CustomerPricingContext;
}) {
  const matches: Product[] = [];
  for (let pageIndex = 0; pageIndex < MAX_SCAN_PAGES; pageIndex += 1) {
    const page = await commerceProvider.getProductPage({
      categorySlug: input.categorySlug,
      offset: pageIndex * CATALOG_PAGE_SIZE,
      limit: CATALOG_PAGE_SIZE,
    }, input.pricing);
    matches.push(...page.products.filter((product) => matchesFilters(product, input.categorySlug, input.maxPrice)));
    if (!page.hasMore) break;
  }
  return matches;
}

function matchesFilters(product: Product, categorySlug?: string, maxPrice?: number) {
  return product.active
    && product.availability !== "UNAVAILABLE"
    && product.price > 0
    && (!categorySlug || product.category.slug === categorySlug)
    && (categorySlug !== "vinos" || isLikelyWine(product))
    && (!maxPrice || product.price <= maxPrice);
}

function isLikelyWine(product: Product) {
  const value = normalize(`${product.name} ${product.presentation}`);
  if (/\b(sidra|garrapinada|turron|chips|mani|gallet|chocolate|aceituna|ajo|salsa)\b/.test(value)) return false;
  if (/\b\d+\s*(g|gr|grs|kg)\b/.test(value)) return false;
  return /\b(vino|malbec|cabernet|bonarda|syrah|merlot|pinot|chardonnay|sauvignon|torrontes|tempranillo|tannat|riesling|viognier|semillon|chenin|brut|espumante|moscato|rosado|blancas?|blend|corte)\b/.test(value);
}

function diverseProducts(products: Product[]) {
  const unique = [...new Map(products.map((product) => [product.id, product])).values()];
  const selected: Product[] = [];
  const brands = new Set<string>();
  for (const product of unique) {
    if (brands.has(product.brand.slug)) continue;
    brands.add(product.brand.slug);
    selected.push(product);
  }
  return [...selected, ...unique.filter((product) => !selected.some((candidate) => candidate.id === product.id))];
}

function cheapestDiverseSelection(products: Product[], quantity: number) {
  const sorted = [...products]
    .sort((left, right) => left.price - right.price || left.name.localeCompare(right.name, "es-AR"));
  return diverseProducts(sorted).slice(0, quantity);
}

function searchGuides(query: string, limit: number) {
  const terms = normalize(query).split(/\s+/).filter((term) => term.length > 1);
  return PUBLISHED_GUIDES.map((guide) => {
    const searchable = normalize([
      guide.title,
      guide.description,
      guide.eyebrow,
      guide.cluster,
      guide.catalog.search,
      ...(guide.catalog.searchTerms ?? []),
    ].filter(Boolean).join(" "));
    const matchedOn = terms.filter((term) => searchable.includes(term));
    return {
      slug: guide.slug,
      title: guide.cardTitle,
      description: guide.description,
      href: `/guias/${guide.slug}`,
      matchedOn,
    };
  })
    .filter((guide) => guide.matchedOn.length)
    .sort((left, right) => right.matchedOn.length - left.matchedOn.length)
    .slice(0, limit);
}

function toSalesProduct(product: Product): SalesProduct {
  return {
    id: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    brand: product.brand.name,
    category: product.category.name,
    categorySlug: product.category.slug,
    presentation: product.presentation,
    description: product.description || null,
    imageUrl: product.images[0]?.src ?? null,
    price: product.price,
    basePrice: product.basePrice,
    currency: "ARS",
    pricingPolicy: product.pricingPolicy,
    discountPercent: product.discountPercent,
    availability: product.availability === "AVAILABLE_NOW" ? "AVAILABLE_NOW" : "SUPPLIER_AVAILABLE",
    stock: product.stock,
    opportunity: product.opportunity ?? null,
  };
}

function recommendationReason(occasion: string, maxPrice?: number) {
  const budget = maxPrice ? ` con un tope de ${formatArs(maxPrice)}` : "";
  return `Los elegí para ${occasion === "general" ? "una compra versátil" : occasion}${budget}, usando catálogo y precios vigentes.`;
}

function pricingNotice(pricing: CustomerPricingContext) {
  return pricing.policy === "RETAIL"
    ? "Usá los precios efectivos de esta sesión."
    : "Usá los precios comerciales efectivos de esta sesión.";
}

function formatArs(value: number) {
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 }).format(value);
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}

function safeErrorCode(error: unknown) {
  if (!(error instanceof Error)) return "UNKNOWN";
  return error.message.replace(/[^A-Z0-9_]/gi, "_").slice(0, 80).toUpperCase();
}
