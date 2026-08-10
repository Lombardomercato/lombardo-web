import type { Metadata } from "next";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { commerceProvider } from "@/lib/commerce";

export const metadata: Metadata = {
  title: "Productos",
  description: "Vinos, regalos y cosas buenas seleccionadas por Lombardo.",
};

interface ProductsPageProps {
  searchParams: Promise<{ categoria?: string | string[] }>;
}

export default async function ProductsPage({ searchParams }: ProductsPageProps) {
  const [products, categories] = await Promise.all([
    commerceProvider.getProducts(),
    commerceProvider.getCategories(),
  ]);
  const { categoria } = await searchParams;
  const requestedCategory = typeof categoria === "string" ? categoria : "todos";
  const initialCategory = categories.some((item) => item.slug === requestedCategory)
    ? requestedCategory
    : "todos";

  return (
    <CatalogExplorer
      key={initialCategory}
      products={products}
      categories={categories}
      initialCategory={initialCategory}
    />
  );
}
