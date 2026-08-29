import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GuideProductGrid } from "@/components/guides/GuideProductGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { absoluteUrl } from "@/lib/seo/metadata";
import { getGuide, hasGuideQuality, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import styles from "../guides.module.css";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return PUBLISHED_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const guide = getGuide((await params).slug);
  if (!guide) return { title: "Guía no encontrada", robots: { index: false } };

  return {
    title: guide.title,
    description: guide.description,
    alternates: { canonical: `/guias/${guide.slug}` },
    openGraph: {
      title: `${guide.title} | LOMBARDO.`,
      description: guide.description,
      url: `/guias/${guide.slug}`,
      type: "article",
      modifiedTime: `${guide.updatedAt}T00:00:00-03:00`,
    },
  };
}

export default async function GuidePage({ params }: GuidePageProps) {
  const [{ slug }, pricingContext] = await Promise.all([
    params,
    getCurrentCustomerPricingContext(),
  ]);
  const guide = getGuide(slug);
  if (!guide) notFound();

  const page = await commerceProvider.getProductPage(
    { categorySlug: guide.catalogCategorySlug, limit: 8 },
    pricingContext,
  );
  if (!hasGuideQuality(guide, page.total)) notFound();

  const url = absoluteUrl(`/guias/${guide.slug}`);
  const schemas = [
    breadcrumbStructuredData([
      { name: "Inicio", path: "/" },
      { name: "Guías", path: "/guias" },
      { name: guide.title, path: `/guias/${guide.slug}` },
    ]),
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${url}#guide`,
      name: guide.title,
      description: guide.description,
      url,
      dateModified: guide.updatedAt,
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: page.products.length,
        itemListElement: page.products.map((product, index) => ({
          "@type": "ListItem",
          position: index + 1,
          name: product.name,
          url: absoluteUrl(`/productos/${product.slug}`),
        })),
      },
    },
  ];

  return (
    <main className={styles.page}>
      <JsonLd data={schemas} />
      <header className={styles.hero}>
        <p>{guide.eyebrow}</p>
        <h1>{guide.title}</h1>
        <p>{guide.description}</p>
      </header>

      <section className={styles.intro} aria-label="Resumen de la guía">
        <p>{guide.intro}</p>
        <ul className={styles.principles}>
          {guide.principles.map((principle) => (
            <li key={principle}>{principle}</li>
          ))}
        </ul>
      </section>

      <div className={styles.sections}>
        {guide.sections.map((section) => (
          <section className={styles.section} key={section.title}>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </section>
        ))}
      </div>

      <GuideProductGrid products={page.products} heading={guide.catalogHeading} />

      <nav className={styles.related} aria-label="Siguientes opciones">
        <Link href="/guias">← Ver todas las guías</Link>
        <Link href="/#contacto">Hablar con Lombardo →</Link>
      </nav>
    </main>
  );
}
