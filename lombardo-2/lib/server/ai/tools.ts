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

interface SalesToolsContext {
  configuration: AiSalesConfiguration;
  pricing: CustomerPricingContext;
  audit: AiAuditStore;
  chatId: string;
}

const occasionSchema = z.enum(["asado", "cena", "regalo", "brindis", "general"]);
const categorySchema = z.string().trim().min(1).max(40).optional();
const priceSchema = z.number().positive().max(100_000_000).optional();
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
      description: "Busca productos SAFE reales por nombre, marca o SKU. También permite filtrar categoría y precio efectivo.",
      inputSchema: z.object({
        query: z.string().trim().max(80).default(""),
        categorySlug: categorySchema,
        maxPrice: priceSchema,
        limit: z.number().int().min(1).max(8).default(5),
      }).strict(),
      execute: (input) => execute("search_products", async () => {
        const products = await searchCatalog({ ...input, pricing: context.pricing });
        return {
          kind: "products" as const,
          reason: input.query
            ? `Resultados reales para “${input.query}”, con el precio vigente de tu sesión.`
            : "Productos reales dentro de los filtros y con el precio vigente de tu sesión.",
          products: products.map(toSalesProduct),
          count: products.length,
        };
      }),
    }),

    get_product: tool({
      description: "Obtiene un producto SAFE real por UUID o SKU y devuelve sus datos vigentes.",
      inputSchema: z.object({
        productId: z.string().uuid().optional(),
        sku: z.string().trim().min(2).max(80).optional(),
      }).strict().refine((input) => Boolean(input.productId || input.sku), "Indicá productId o sku"),
      execute: (input) => execute("get_product", async () => {
        let product: Product | undefined;
        if (input.productId) {
          product = (await commerceProvider.getProductsByIds([input.productId], context.pricing))[0];
        } else if (input.sku) {
          const matches = await searchCatalog({ query: input.sku, limit: 8, pricing: context.pricing });
          product = matches.find((candidate) => candidate.sku.toLocaleLowerCase("es-AR") === input.sku!.toLocaleLowerCase("es-AR")) ?? matches[0];
        }
        return { kind: "product" as const, product: product ? toSalesProduct(product) : null };
      }),
    }),

    recommend_products: tool({
      description: "Elige productos SAFE reales para una ocasión o presupuesto. Usala para asados, regalos y búsquedas generales por precio.",
      inputSchema: z.object({
        occasion: occasionSchema,
        preferences: z.string().trim().max(80).optional(),
        categorySlug: categorySchema,
        maxPrice: priceSchema,
        limit: z.number().int().min(1).max(6).default(4),
      }).strict(),
      execute: (input) => execute("recommend_products", async () => {
        const products = await recommendations({ ...input, pricing: context.pricing });
        return {
          kind: "products" as const,
          reason: recommendationReason(input.occasion, input.maxPrice),
          products: products.map(toSalesProduct),
          count: products.length,
        };
      }),
    }),

    get_effective_price: tool({
      description: "Revalida el precio efectivo de un producto para la identidad autenticada de esta sesión.",
      inputSchema: z.object({ productId: z.string().uuid() }).strict(),
      execute: (input) => execute("get_effective_price", async () => {
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
      }),
    }),

    get_opportunities: tool({
      description: "Obtiene oportunidades SAFE reales y vigentes del catálogo Lombardo.",
      inputSchema: z.object({
        categorySlug: categorySchema,
        maxPrice: priceSchema,
        limit: z.number().int().min(1).max(8).default(5),
      }).strict(),
      execute: (input) => execute("get_opportunities", async () => {
        const products = (await commerceProvider.getActiveOpportunities(48, context.pricing))
          .filter((product) => matchesFilters(product, input.categorySlug, input.maxPrice))
          .slice(0, input.limit);
        return {
          kind: "products" as const,
          reason: "Son oportunidades reales y vigentes verificadas por Lombardo.",
          products: products.map(toSalesProduct),
          count: products.length,
        };
      }),
    }),

    search_guides: tool({
      description: "Busca guías editoriales publicadas por Lombardo para aportar criterio de elección.",
      inputSchema: z.object({
        query: z.string().trim().min(2).max(120),
        limit: z.number().int().min(1).max(3).default(2),
      }).strict(),
      execute: (input) => execute("search_guides", async () => ({
        kind: "guides" as const,
        guides: searchGuides(input.query, input.limit),
      })),
    }),

    build_selection: tool({
      description: "Arma una selección de varias botellas SAFE sin superar un presupuesto total real.",
      inputSchema: z.object({
        quantity: z.number().int().min(2).max(24),
        totalBudget: z.number().positive().max(100_000_000),
        occasion: occasionSchema.default("general"),
        categorySlug: categorySchema,
      }).strict(),
      execute: (input) => execute("build_selection", async () => {
        const candidates = await scanCatalog({
          categorySlug: input.categorySlug ?? "vinos",
          maxPrice: input.totalBudget,
          pricing: context.pricing,
        });
        const products = cheapestDiverseSelection(candidates, input.quantity);
        const total = products.reduce((sum, product) => sum + product.price, 0);
        return {
          kind: "selection" as const,
          reason: `Selección calculada con precios vigentes para ${input.quantity} unidades y un tope total de ${formatArs(input.totalBudget)}.`,
          products: products.map(toSalesProduct),
          quantity: products.length,
          total,
          budget: input.totalBudget,
          withinBudget: products.length === input.quantity && total <= input.totalBudget,
        };
      }),
    }),
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
    && (!maxPrice || product.price <= maxPrice);
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
  return diverseProducts(products)
    .sort((left, right) => left.price - right.price || left.name.localeCompare(right.name, "es-AR"))
    .slice(0, quantity);
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
