import type { Metadata } from "next";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { commerceProvider } from "@/lib/commerce";

export const metadata: Metadata = {
  title: "Productos",
  description: "Vinos, regalos y cosas buenas seleccionadas por Lombardo.",
};

export const dynamic = "force-dynamic";

interface ProductsPageProps {
  searchParams: Promise<{ categoria?: string | string[] }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const categories = await commerceProvider.getCategories();
  const { categoria } = await searchParams;
  const requestedCategory = typeof categoria === "string" ? categoria : "todos";
  const initialCategory = categories.some((item) => item.slug === requestedCategory)
    ? requestedCategory
    : "todos";
  const initialPage = await commerceProvider.getProductPage({
    categorySlug: initialCategory === "todos" ? undefined : initialCategory,
  });

  return (
    <CatalogExplorer
      key={initialCategory}
      initialPage={initialPage}
      categories={categories}
      initialCategory={initialCategory}
    />
  );
}
