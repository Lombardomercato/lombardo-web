import type { Category, Product } from "../../types/commerce.ts";

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
    category: category("regalos", "Regalos y accesorios"),
    prefixes: ["ACC", "BLO", "BOL"],
  },
] as const;

export const RUNIA_CATALOG_CATEGORIES = [
  WINE_CATEGORY,
  ...CATEGORY_RULES.map((rule) => rule.category),
] as const;

const SPECIAL_PREFIXES = CATEGORY_RULES.flatMap((rule) => rule.prefixes);

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
  if (categorySlug === WINE_CATEGORY.slug) {
    return {
      key: "not.or",
      value: `(${SPECIAL_PREFIXES.map((prefix) => `supplier_sku.ilike.${prefix}*`).join(",")})`,
    };
  }

  const rule = CATEGORY_RULES.find(
    (candidate) => candidate.category.slug === categorySlug,
  );
  if (!rule) return null;

  return {
    key: "or",
    value: `(${rule.prefixes.map((prefix) => `supplier_sku.ilike.${prefix}*`).join(",")})`,
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

function presentationFor(row: RuniaSupplierProductRow) {
  const stored = row.normalized_presentation?.trim() || row.presentation_raw?.trim();
  if (stored) return stored;

  const fromName = row.name_raw.match(/\bx\s*([^,]+)$/i)?.[1]?.trim();
  return fromName || "Unidad";
}

function retailPrice(row: RuniaSupplierProductRow) {
  const prices = Array.isArray(row.retail_prices)
    ? row.retail_prices
    : row.retail_prices
      ? [row.retail_prices]
      : [];
  const retail = prices.find((price) => price.price_type === "retail");
  const price = Number(retail?.current_price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("El producto SAFE no tiene un precio retail válido.");
  }
  return price;
}

export function mapRuniaSupplierProduct(
  row: RuniaSupplierProductRow,
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
  const name = row.name_raw.trim();
  const brand = inferBrand(name);
  const productCategory = categoryForSupplierSku(sku);
  const presentation = presentationFor(row);

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
    price: retailPrice(row),
    availability: "SUPPLIER_AVAILABLE",
    stock: { available: true, quantity: 0 },
    images,
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [name, sku, brand.name, productCategory.name, presentation],
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
