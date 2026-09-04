import type { Category, Product } from "../../types/commerce.ts";
import type { CustomerPricingContext } from "../server/customers/types.ts";
import { resolveCommercialPrice } from "../pricing/policy.ts";
import { displayPresentation, displayProductName } from "./product-presentation.ts";

interface CategoryRule {
  category: Category;
  prefixes: readonly string[];
}

const category = (slug: string, name: string): Category => ({
  id: `runia-category-${slug}`,
  slug,
  name,
});

const WINE_CATEGORY = category("vinos", "Vinos");

const CATEGORY_RULES: readonly CategoryRule[] = [
  {
    category: category("destilados", "Destilados"),
    prefixes: [
      "APE",
      "BB",
      "BDS",
      "COS",
      "CRA",
      "KNH",
      "LIC",
      "NWS",
      "PHA",
      "PIND",
      "VV",
      "WI",
    ],
  },
  {
    category: category("cervezas", "Cervezas"),
    prefixes: ["CER"],
  },
  {
    category: category("sin-alcohol", "Sin alcohol"),
    prefixes: ["AG", "GAS", "YAC"],
  },
  {
    category: category("gourmet", "Gourmet"),
    prefixes: [
      "BAD",
      "BIM",
      "BOR",
      "CAF",
      "CHO",
      "COM",
      "DEC",
      "FOL",
      "JCR",
      "LAU",
      "LOM",
      "MAI",
      "MOR",
      "QES",
      "SEG",
      "VALE",
    ],
  },
  {
    category: category("regalos", "Accesorios"),
    prefixes: ["ACC", "BLO", "BOL"],
  },
] as const;

export const RUNIA_CATALOG_CATEGORIES = [
  WINE_CATEGORY,
  ...CATEGORY_RULES.map((rule) => rule.category),
] as const;

const SPECIAL_PREFIXES = CATEGORY_RULES.flatMap((rule) => rule.prefixes);

export interface CategorySearchScope {
  prefixes?: string[];
  excludedPrefixes?: string[];
}

export function categorySearchScope(
  categorySlug: string | undefined,
): CategorySearchScope {
  if (!categorySlug) return {};
  if (categorySlug === WINE_CATEGORY.slug) {
    return { excludedPrefixes: [...SPECIAL_PREFIXES] };
  }
  const rule = CATEGORY_RULES.find(
    (candidate) => candidate.category.slug === categorySlug,
  );
  return rule ? { prefixes: [...rule.prefixes] } : {};
}

export interface RuniaSupplierProductRow {
  runia_product_id: string;
  supplier_sku: string;
  name_raw: string;
  presentation_raw: string | null;
  normalized_presentation: string | null;
  active: boolean;
  eligibility_status: string;
  retail_prices:
    | Array<{ price_type: string; current_price: number | string }>
    | { price_type: string; current_price: number | string }
    | null;
  lombardo_prices?:
    | Array<{
        id?: string;
        price_type: string;
        current_price: number | string;
        version: number | string;
        active: boolean;
      }>
    | {
        id?: string;
        price_type: string;
        current_price: number | string;
        version: number | string;
        active: boolean;
      }
    | null;
  opportunities?:
    | Array<{
        selling_price_id: string;
        reference_price: number | string;
        opportunity: boolean;
        opportunity_start: string;
        opportunity_review_at: string;
      }>
    | {
        selling_price_id: string;
        reference_price: number | string;
        opportunity: boolean;
        opportunity_start: string;
        opportunity_review_at: string;
      }
    | null;
  editorial?:
    | Array<{ brand_name: string | null }>
    | { brand_name: string | null }
    | null;
}

export interface RuniaPublicMediaRow {
  id: string;
  supplier_product_id: string;
  bucket_id: string;
  storage_path: string;
  alt_text: string;
  width: number | null;
  height: number | null;
  position: number;
  is_primary: boolean;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

export const slugify = (value: string) =>
  normalize(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const skuPrefix = (sku: string) => sku.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "";

export function categoryForSupplierSku(sku: string): Category {
  const prefix = skuPrefix(sku);
  return (
    CATEGORY_RULES.find((rule) => rule.prefixes.includes(prefix))?.category ??
    WINE_CATEGORY
  );
}

export function categoryFilterForPostgrest(categorySlug: string) {
  const scope = categorySearchScope(categorySlug);
  if (scope.excludedPrefixes) {
    return {
      key: "not.or",
      value: `(${scope.excludedPrefixes.map((prefix) => `supplier_sku.ilike.${prefix}*`).join(",")})`,
    };
  }
  if (!scope.prefixes) return null;

  return {
    key: "or",
    value: `(${scope.prefixes.map((prefix) => `supplier_sku.ilike.${prefix}*`).join(",")})`,
  };
}

export function inferBrand(name: string) {
  const tokens = name.trim().split(/\s+/).filter(Boolean);
  const uppercaseTokens: string[] = [];
  for (const token of tokens.slice(0, 4)) {
    const letters = token.replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ]/g, "");
    if (letters && letters !== letters.toLocaleUpperCase("es-AR")) break;
    uppercaseTokens.push(token);
  }

  const brandName = uppercaseTokens.join(" ") || tokens[0] || "VINROS";
  return {
    id: `runia-brand-${slugify(brandName) || "vinros"}`,
    slug: slugify(brandName) || "vinros",
    name: brandName,
  };
}

function editorialBrand(row: RuniaSupplierProductRow) {
  const editorial = Array.isArray(row.editorial)
    ? row.editorial[0]
    : row.editorial;
  return editorial?.brand_name?.trim() || null;
}

function presentationFor(row: RuniaSupplierProductRow) {
  const stored = row.normalized_presentation?.trim() || row.presentation_raw?.trim();
  if (stored) return stored;

  const fromName = row.name_raw.match(/\bx\s*([^,]+)$/i)?.[1]?.trim();
  return fromName || "Unidad";
}

function selectedPrice(
  row: RuniaSupplierProductRow,
  pricingContext: CustomerPricingContext,
) {
  const prices = Array.isArray(row.retail_prices)
    ? row.retail_prices
    : row.retail_prices
      ? [row.retail_prices]
      : [];
  const selected = prices.find(
    (price) => price.price_type === pricingContext.basePriceType,
  );
  const lombardoPrices = Array.isArray(row.lombardo_prices)
    ? row.lombardo_prices
    : row.lombardo_prices
      ? [row.lombardo_prices]
      : [];
  const sellingPrice = pricingContext.basePriceType === "retail"
    ? lombardoPrices.find((price) => price.price_type === "retail" && price.active)
    : undefined;
  const price = Number(sellingPrice?.current_price ?? selected?.current_price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error(
      `El producto SAFE no tiene un precio ${pricingContext.basePriceType} válido.`,
    );
  }
  return price;
}

function activeOpportunity(
  row: RuniaSupplierProductRow,
  pricingContext: CustomerPricingContext,
) {
  if (pricingContext.basePriceType !== "retail") return undefined;
  const sellingPrice = (Array.isArray(row.lombardo_prices)
    ? row.lombardo_prices
    : row.lombardo_prices
      ? [row.lombardo_prices]
      : []).find((price) => price.price_type === "retail" && price.active);
  const opportunity = (Array.isArray(row.opportunities)
    ? row.opportunities
    : row.opportunities
      ? [row.opportunities]
      : []).find((candidate) => candidate.opportunity);
  if (!opportunity || !sellingPrice || opportunity.selling_price_id !== sellingPrice.id) {
    return undefined;
  }
  const referencePrice = Number(opportunity.reference_price);
  const selling = Number(sellingPrice.current_price);
  const startAt = Date.parse(opportunity.opportunity_start);
  const reviewAt = Date.parse(opportunity.opportunity_review_at);
  const now = Date.now();
  if (
    !Number.isFinite(referencePrice) ||
    !Number.isFinite(selling) ||
    selling >= referencePrice ||
    !Number.isFinite(startAt) ||
    !Number.isFinite(reviewAt) ||
    startAt > now ||
    reviewAt <= now
  ) return undefined;
  return {
    referencePrice,
    startAt: opportunity.opportunity_start,
    reviewAt: opportunity.opportunity_review_at,
  };
}

function assertPricingList(pricingContext: CustomerPricingContext) {
  const expectedPriceType =
    pricingContext.policy === "WHOLESALE"
      ? "wholesale"
      : pricingContext.policy === "BUSINESS"
        ? "business"
        : "retail";
  if (pricingContext.basePriceType !== expectedPriceType) {
    throw new Error("La política comercial y la lista de precios no coinciden.");
  }
}

export function mapRuniaSupplierProduct(
  row: RuniaSupplierProductRow,
  pricingContext: CustomerPricingContext,
  images: Product["images"] = [],
): Product {
  if (
    row.eligibility_status !== "safe" ||
    !row.active ||
    !row.runia_product_id ||
    !row.supplier_sku?.trim() ||
    !row.name_raw?.trim()
  ) {
    throw new Error("Runia devolvió un producto que no es SAFE y activo.");
  }

  const sku = row.supplier_sku.trim();
  const sourceName = row.name_raw.trim();
  const name = displayProductName(sourceName);
  const inferredBrand = inferBrand(sourceName);
  const brandName = editorialBrand(row) || inferredBrand.name;
  const brand = {
    id: `runia-brand-${slugify(brandName) || "vinros"}`,
    slug: slugify(brandName) || "vinros",
    name: brandName,
  };
  const productCategory = categoryForSupplierSku(sku);
  const presentation = displayPresentation(presentationFor(row));
  assertPricingList(pricingContext);
  const resolvedPrice = resolveCommercialPrice(
    selectedPrice(row, pricingContext),
    pricingContext,
  );
  const opportunity = activeOpportunity(row, pricingContext);

  return {
    id: row.runia_product_id,
    sourceProductId: row.runia_product_id,
    sku,
    slug: `${slugify(name)}--${row.runia_product_id}`,
    name,
    description: "",
    presentation,
    brand,
    category: productCategory,
    price: resolvedPrice.finalUnitPrice,
    basePrice: resolvedPrice.baseUnitPrice,
    priceType: resolvedPrice.priceType,
    pricingPolicy: resolvedPrice.pricingPolicy,
    discountPercent: resolvedPrice.discountPercent,
    pricingContextKey: pricingContext.contextKey,
    compareAtPrice:
      pricingContext.policy === "CUSTOM_DISCOUNT" &&
      resolvedPrice.finalUnitPrice < resolvedPrice.baseUnitPrice
        ? resolvedPrice.baseUnitPrice
        : undefined,
    opportunity,
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images,
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [sourceName, sku, brand.name, productCategory.name, presentation],
  };
}

export function runiaProductIdFromProductSlug(slug: string) {
  const separator = slug.lastIndexOf("--");
  if (separator < 1) return null;
  const productId = slug.slice(separator + 2).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    productId,
  )
    ? productId.toLowerCase()
    : null;
}
