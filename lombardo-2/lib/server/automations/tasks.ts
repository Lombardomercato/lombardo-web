import "server-only";

import { createHash } from "node:crypto";
import { commerceProvider } from "@/lib/commerce";
import { loadGuideProducts } from "@/lib/seo/guide-products";
import { PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { retailPricingContext } from "@/lib/server/customers/types";
import { createSecretCellarService } from "@/lib/server/secret-cellar/secret-cellar-service";
import type { Product } from "@/types/commerce";
import type { AutomationTask } from "./orchestrator";
import type { AutomationStore } from "./automation-store";

const HOME_CATEGORIES = ["vinos", "destilados", "gourmet", "regalos"];

function score(seed: string, value: string) {
  return createHash("sha256").update(`${seed}:${value}`).digest("hex");
}

function ranked<T>(items: T[], seed: string, key: (item: T) => string) {
  return [...items].sort((left, right) =>
    score(seed, key(left)).localeCompare(score(seed, key(right))),
  );
}

function uniqueProducts(products: Product[]) {
  return [...new Map(products.map((product) => [product.id, product])).values()];
}

function selectDiverseProducts(input: {
  candidates: Product[];
  pinned: Array<{ product: Product; position: number }>;
  recent: Set<string>;
  date: string;
  limit: number;
}) {
  const selected: Array<Product | undefined> = Array(input.limit).fill(undefined);
  for (const pin of input.pinned) {
    if (pin.position < input.limit && !selected[pin.position]) selected[pin.position] = pin.product;
  }
  const pinnedIds = new Set(input.pinned.map((pin) => pin.product.id));
  const pool = ranked(
    input.candidates.filter((product) => !pinnedIds.has(product.id)),
    `${input.date}:home-featured`,
    (product) => product.id,
  ).sort((left, right) => Number(right.images.length > 0) - Number(left.images.length > 0));
  const usedBrands = new Set(selected.flatMap((product) => product ? [product.brand.name] : []));
  const usedCategories = new Set(selected.flatMap((product) => product ? [product.category.slug] : []));
  const passes = [
    (product: Product) => !input.recent.has(product.id) && !usedBrands.has(product.brand.name) && !usedCategories.has(product.category.slug),
    (product: Product) => !input.recent.has(product.id) && !usedBrands.has(product.brand.name),
    (product: Product) => !input.recent.has(product.id),
    () => true,
  ];
  for (const accept of passes) {
    for (const product of pool) {
      if (selected.every(Boolean) || selected.includes(product) || !accept(product)) continue;
      const position = selected.findIndex((value) => !value);
      selected[position] = product;
      usedBrands.add(product.brand.name);
      usedCategories.add(product.category.slug);
    }
  }
  return selected.filter((product): product is Product => Boolean(product)).slice(0, input.limit);
}

async function loadFeaturedCandidates(date: string, tenantSlug: string) {
  const context = retailPricingContext(tenantSlug);
  const first = await commerceProvider.getProductPage({ limit: 48 }, context);
  const pageCount = Math.max(1, Math.ceil(first.total / 48));
  const start = Number.parseInt(score(`${tenantSlug}:${date}`, "featured-window").slice(0, 8), 16) % pageCount;
  const pages = await Promise.all(
    Array.from({ length: 5 }, (_, index) => ((start + index * 7) % pageCount) * 48)
      .filter((offset) => offset !== 0)
      .map((offset) => commerceProvider.getProductPage({ offset, limit: 48 }, context)),
  );
  return { products: uniqueProducts([first, ...pages].flatMap((page) => page.products)), total: first.total };
}

function numericRule(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

async function productsForContent(entry: {
  slug: string;
  liveRules: { categorySlug?: string; limit?: number; minimumPrice?: number; maximumPrice?: number };
}, tenantSlug: string) {
  const limit = Math.min(Math.max(Math.trunc(numericRule(entry.liveRules.limit) ?? 8), 1), 20);
  const page = await commerceProvider.getProductPage({
    categorySlug: entry.liveRules.categorySlug,
    limit: 48,
  }, retailPricingContext(tenantSlug));
  return page.products.filter((product) => {
    const minimum = numericRule(entry.liveRules.minimumPrice);
    const maximum = numericRule(entry.liveRules.maximumPrice);
    return (minimum === undefined || product.price >= minimum) &&
      (maximum === undefined || product.price <= maximum);
  }).slice(0, limit);
}

export function createAutomationTasks(input: {
  store: AutomationStore;
  tenantSlug: string;
}): Record<"vinros" | "daily_cava" | "daily_featured" | "live_guides" | "seo_content", AutomationTask> {
  const vinros: AutomationTask = async () => {
    const latest = await input.store.latestVinrosRun();
    if (!latest) return { status: "warning", summary: { runFound: false }, warnings: ["VINROS todavía no tiene una ejecución auditada."], requiresReview: true };
    const dryRun = (latest.dry_run_result ?? {}) as Record<string, unknown>;
    const blocked = ["failed", "blocked"].includes(String(latest.status)) || dryRun.policyCanWrite === false;
    return {
      status: blocked ? "blocked" : "completed",
      summary: {
        sourceRunId: latest.id,
        sourceStatus: latest.status,
        products: latest.products,
        pricesChanged: latest.prices_changed,
        blocked: latest.blocked,
        pendingReview: latest.pending_review,
        supplierOnlyCost: latest.supplier_only_cost,
        guardrailsPreserved: true,
      },
      warnings: blocked ? [String(latest.error_summary || "El circuit breaker VINROS requiere revisión.")] : [],
      requiresReview: blocked,
    };
  };

  const dailyCava: AutomationTask = async ({ date }) => {
    const result = await createSecretCellarService().ensureChallengeWithFallback(date);
    return {
      status: result.fallback ? "warning" : "completed",
      summary: {
        challengeId: result.challenge.id,
        challengeDate: result.challenge.date,
        candidates: result.challenge.candidates.length,
        fallback: result.fallback,
        safeOnly: true,
      },
      warnings: result.fallback ? ["La Cava usó el último desafío válido como fallback."] : [],
    };
  };

  const dailyFeatured: AutomationTask = async ({ runId, date }) => {
    const [catalog, recent, pins] = await Promise.all([
      loadFeaturedCandidates(date, input.tenantSlug),
      input.store.recentFeaturedProductIds(date),
      input.store.listPins(),
    ]);
    const context = retailPricingContext(input.tenantSlug);
    const pinnedProducts = await commerceProvider.getProductsByIds(pins.map((pin) => pin.productId), context);
    const pinnedById = new Map(pinnedProducts.map((product) => [product.id, product]));
    const validPins = pins.flatMap((pin) => {
      const product = pinnedById.get(pin.productId);
      return product ? [{ product, position: pin.position }] : [];
    });
    const selected = selectDiverseProducts({
      candidates: catalog.products,
      pinned: validPins,
      recent,
      date,
      limit: 6,
    });
    if (selected.length < 6) {
      return {
        status: "warning",
        summary: { selected: selected.length, catalogTotal: catalog.total, retainedStableFallback: true },
        warnings: ["No hubo seis candidatos SAFE para reemplazar la selección estable."],
      };
    }
    const categories = ranked(HOME_CATEGORIES, `${date}:categories`, (value) => value);
    const guides = ranked(PUBLISHED_GUIDES.map((guide) => guide.slug), `${date}:guides`, (value) => value);
    await input.store.replaceHomeSlots(runId, date, {
      products: selected.map((product) => ({
        productId: product.id,
        isPinned: validPins.some((pin) => pin.product.id === product.id),
      })),
      categories,
      guides,
    });
    return {
      status: "completed",
      summary: {
        selected: selected.length,
        withImage: selected.filter((product) => product.images.length > 0).length,
        pinned: validPins.length,
        categories: categories.length,
        recentExcluded: recent.size,
        catalogTotal: catalog.total,
        safeOnly: true,
      },
    };
  };

  const liveGuides: AutomationTask = async ({ runId }) => {
    for (const guide of PUBLISHED_GUIDES) {
      await input.store.upsertContentEntry({
        type: "GUIDE",
        slug: guide.slug,
        title: guide.title,
        workflowStatus: "PUBLISHED",
        editorialContent: { source: "code", editorialSeparated: true },
        liveRules: {
          mode: guide.catalog.mode,
          categorySlug: guide.catalog.categorySlug,
          limit: guide.catalog.limit,
          search: guide.catalog.search,
          searchTerms: guide.catalog.searchTerms,
          priceMax: guide.catalog.priceMax,
        },
      });
    }
    const entries = await input.store.listContent({ type: "GUIDE", statuses: ["PUBLISHED"] });
    const guidesBySlug = new Map(PUBLISHED_GUIDES.map((guide) => [guide.slug, guide]));
    let productsUpdated = 0;
    for (const entry of entries) {
      const guide = guidesBySlug.get(entry.slug);
      if (!guide) continue;
      const products = await loadGuideProducts(guide, retailPricingContext(input.tenantSlug));
      if (!products.length) throw new Error(`La guía ${entry.slug} no tiene candidatos SAFE.`);
      productsUpdated += await input.store.replaceContentProducts(runId, entry.id, products);
    }
    return {
      status: "completed",
      summary: { guidesUpdated: entries.length, productsUpdated, safeOnly: true, editorialSeparated: true },
    };
  };

  const seoContent: AutomationTask = async ({ runId }) => {
    const [published, review] = await Promise.all([
      input.store.listContent({ type: "ARTICLE", statuses: ["PUBLISHED"] }),
      input.store.listContent({ type: "ARTICLE", statuses: ["QA", "APPROVED"] }),
    ]);
    let productsUpdated = 0;
    for (const entry of published) {
      const products = await productsForContent(entry, input.tenantSlug);
      if (products.length) productsUpdated += await input.store.replaceContentProducts(runId, entry.id, products);
    }
    const requiresReview = review.length > 0;
    return {
      status: requiresReview ? "warning" : "completed",
      summary: {
        publishedUpdated: published.length,
        productsUpdated,
        awaitingHumanApproval: review.length,
        autoPublished: 0,
        workflow: ["OPPORTUNITY", "DRAFT", "QA", "APPROVED", "PUBLISHED"],
      },
      warnings: requiresReview ? [`${review.length} contenido(s) requieren aprobación humana.`] : [],
      requiresReview,
    };
  };

  return { vinros, daily_cava: dailyCava, daily_featured: dailyFeatured, live_guides: liveGuides, seo_content: seoContent };
}
