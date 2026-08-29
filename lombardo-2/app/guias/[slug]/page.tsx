import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Footer } from "@/components/layout/Footer";
import { GuideHeroVisual, GuideVisualMoment } from "@/components/guides/GuideEditorialVisual";
import { GuideRelatedLink, GuideShare, GuideViewTracker } from "@/components/guides/GuideInteractions";
import { GuideProductGrid } from "@/components/guides/GuideProductGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { loadGuideProducts } from "@/lib/seo/guide-products";
import { absoluteUrl } from "@/lib/seo/metadata";
import { getGuide, getRelatedGuides, hasGuideQuality, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { articleStructuredData, breadcrumbStructuredData } from "@/lib/seo/structured-data";
import styles from "../guides.module.css";

interface GuidePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamic = "force-dynamic";

const getGuideDefinition = cache((slug: string) => getGuide(slug));

export function generateStaticParams() {
  return PUBLISHED_GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: GuidePageProps): Promise<Metadata> {
  const guide = getGuideDefinition((await params).slug);
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
      publishedTime: `${guide.publishedAt}T09:00:00-03:00`,
      modifiedTime: `${guide.updatedAt}T09:00:00-03:00`,
      authors: ["LOMBARDO."],
      section: guide.cluster,
      images: [{ url: `/guias/${guide.slug}/opengraph-image`, width: 1200, height: 630, alt: guide.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: [`/guias/${guide.slug}/opengraph-image`],
    },
  };
}

function formattedDate(date: string) {
  const [year, month, day] = date.split("-");
  const months = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
  return `${day} ${months[Number(month) - 1]} ${year}`;
}

export default async function GuidePage({ params }: GuidePageProps) {
  const [{ slug }, pricingContext] = await Promise.all([params, getCurrentCustomerPricingContext()]);
  const guide = getGuideDefinition(slug);
  if (!guide) notFound();

  const products = await loadGuideProducts(guide, pricingContext);
  if (!hasGuideQuality(guide, products.length)) notFound();

  const url = absoluteUrl(`/guias/${guide.slug}`);
  const relatedGuides = getRelatedGuides(guide);
  const schemas = [
    breadcrumbStructuredData([
      { name: "Inicio", path: "/" },
      { name: "Guías", path: "/guias" },
      { name: guide.title, path: `/guias/${guide.slug}` },
    ]),
    articleStructuredData({
      slug: guide.slug,
      title: guide.title,
      description: guide.description,
      publishedAt: `${guide.publishedAt}T09:00:00-03:00`,
      updatedAt: `${guide.updatedAt}T09:00:00-03:00`,
      category: guide.cluster,
      productImages: products.flatMap((product) => product.images.slice(0, 1).map((image) => image.src)).slice(0, 4),
    }),
    {
      "@context": "https://schema.org",
      "@type": "ItemList",
      "@id": `${url}#recommended-products`,
      numberOfItems: products.length,
      itemListElement: products.map((product, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: product.name,
        url: absoluteUrl(`/productos/${product.slug}`),
      })),
    },
  ];

  return (
    <>
      <main className={styles.articlePage} data-tone={guide.heroTone}>
        <JsonLd data={schemas} />
        <GuideViewTracker guideSlug={guide.slug} />

        <nav className={styles.breadcrumbs} aria-label="Migas de pan">
          <Link href="/">Inicio</Link><span>/</span><Link href="/guias">Guías</Link><span>/</span><span>{guide.cluster}</span>
        </nav>

        <header className={styles.articleHero}>
          <div className={styles.heroCopy}>
            <p>{guide.eyebrow}</p>
            <h1 aria-label={guide.title}>
              {guide.titleLines.map((line) => (
                <span className={line.length > 10 ? styles.longTitleLine : undefined} key={line} aria-hidden="true">{line}</span>
              ))}
            </h1>
            <p>{guide.dek}</p>
            <dl>
              <div><dt>FECHA</dt><dd>{formattedDate(guide.publishedAt)}</dd></div>
              <div><dt>LECTURA</dt><dd>{guide.readingMinutes} MIN</dd></div>
              <div><dt>AUTOR</dt><dd>LOMBARDO.</dd></div>
            </dl>
          </div>
          <GuideHeroVisual products={products} />
        </header>

        <article className={styles.articleBody}>
          <div className={styles.standfirst}>
            <p>{guide.intro}</p>
            <aside>
              <span>PARA ELEGIR MEJOR / {guide.cluster}</span>
              <GuideShare guideSlug={guide.slug} title={guide.title} />
            </aside>
          </div>

          <div className={styles.editorialSections}>
            {guide.sections.map((section, index) => (
              <div key={section.title}>
                <section className={styles.editorialSection}>
                  <div>
                    <p>{section.eyebrow}</p>
                    <h2>{section.title}</h2>
                  </div>
                  <div className={styles.sectionCopy}>
                    {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
                    {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
                    {section.quote ? <blockquote>{section.quote}</blockquote> : null}
                  </div>
                </section>
                {index === 0 || index === 2 ? (
                  <GuideVisualMoment
                    products={products.slice(index === 0 ? 2 : 4, index === 0 ? 4 : 6)}
                    caption={guide.visualCaptions[index === 0 ? 0 : 1]}
                    index={index === 0 ? 0 : 1}
                  />
                ) : null}
              </div>
            ))}
          </div>
        </article>

        <GuideProductGrid
          products={products}
          heading={guide.catalog.heading}
          description={guide.catalog.description}
          guideSlug={guide.slug}
          allHref={guide.catalog.allHref}
          allLabel={guide.catalog.allLabel}
        />

        <section className={styles.commercialCta}>
          <p>¿QUERÉS RESOLVERLO CON ALGUIEN?</p>
          <h2>Contanos la ocasión. Nosotros acortamos la lista.</h2>
          <div>
            <Link href={guide.catalog.allHref}>VER CATÁLOGO →</Link>
            <Link href="/#contacto">HABLAR CON LOMBARDO ↗</Link>
          </div>
        </section>

        <section className={styles.relatedStories} aria-labelledby="related-title">
          <p>SEGUIR LEYENDO</p>
          <h2 id="related-title">Una buena botella lleva a otra.</h2>
          <div>
            {relatedGuides.map((related, index) => (
              <GuideRelatedLink guideSlug={guide.slug} relatedSlug={related.slug} key={related.slug}>
                <span>{String(index + 1).padStart(2, "0")} · {related.cluster}</span>
                <h3>{related.cardTitle}</h3>
                <strong>LEER →</strong>
              </GuideRelatedLink>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
