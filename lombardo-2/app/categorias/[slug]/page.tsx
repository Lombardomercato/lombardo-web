import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CatalogExplorer } from "@/components/catalog/CatalogExplorer";
import { JsonLd } from "@/components/seo/JsonLd";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { getSeoCategory, SEO_CATEGORIES } from "@/lib/seo/categories";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ buscar?: string | string[] }>;
}

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return SEO_CATEGORIES.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const category = getSeoCategory((await params).slug);
  if (!category) {
    return { title: "Categoría no encontrada", robots: { index: false } };
  }

  return {
    title: category.title,
    description: category.description,
    alternates: { canonical: `/categorias/${category.slug}` },
    openGraph: {
      title: `${category.title} | LOMBARDO.`,
      description: category.description,
      url: `/categorias/${category.slug}`,
      type: "website",
    },
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [{ slug }, categories, pricingContext, { buscar }] = await Promise.all([
    params,
    commerceProvider.getCategories(),
    getCurrentCustomerPricingContext(),
    searchParams,
  ]);
  const seoCategory = getSeoCategory(slug);
  const category = categories.find((item) => item.slug === slug);
  if (!seoCategory || !category) notFound();

  const initialPage = await commerceProvider.getProductPage(
    {
      categorySlug: category.slug,
      search: typeof buscar === "string" ? buscar : undefined,
    },
    pricingContext,
  );
  if (!initialPage.total) notFound();

  return (
    <>
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Inicio", path: "/" },
          { name: "Productos", path: "/productos" },
          { name: category.name, path: `/categorias/${category.slug}` },
        ])}
      />
      <CatalogExplorer
        key={category.slug}
        initialPage={initialPage}
        categories={categories}
        initialCategory={category.slug}
        heroTitle={seoCategory.heroTitle}
        heroDescription={seoCategory.heroDescription}
        initialQuery={typeof buscar === "string" ? buscar : ""}
      />
    </>
  );
}
