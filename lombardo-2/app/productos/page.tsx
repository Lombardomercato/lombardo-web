import type { Metadata } from "next";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { isQuickOrderPricingContext } from "@/lib/quick-order/types";

export const metadata: Metadata = {
  title: "Tienda online de vinos, destilados y regalos en Rosario",
  description:
    "Explorá vinos, destilados, regalos y productos gourmet para comprar online en Rosario con precios actualizados.",
  alternates: { canonical: "/productos" },
  openGraph: {
    title: "Vinos, destilados y regalos online en Rosario | LOMBARDO.",
    description:
      "Catálogo online de Lombardo con productos y precios actualizados.",
    url: "/productos",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

interface ProductsPageProps {
  searchParams: Promise<{ categoria?: string | string[]; buscar?: string | string[] }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const [categories, pricingContext, { categoria, buscar }] = await Promise.all([
    commerceProvider.getCategories(),
    getCurrentCustomerPricingContext(),
    searchParams,
  ]);
  const requestedCategory = typeof categoria === "string" ? categoria : "todos";
  const initialCategory = categories.some((item) => item.slug === requestedCategory)
    ? requestedCategory
    : "todos";
  const initialPage = await commerceProvider.getProductPage(
    {
      categorySlug: initialCategory === "todos" ? undefined : initialCategory,
      search: typeof buscar === "string" ? buscar : undefined,
    },
    pricingContext,
  );

  return (
    <CatalogExplorer
      key={initialCategory}
      initialPage={initialPage}
      categories={categories}
      initialCategory={initialCategory}
      quickOrderAvailable={isQuickOrderPricingContext(pricingContext)}
      initialQuery={typeof buscar === "string" ? buscar : ""}
    />
  );
}
