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
import { loadLiveGuideProducts } from "@/lib/server/automations/live-data";
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
  const socialImage = guide.heroImage ?? `/guias/${guide.slug}/opengraph-image`;

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
      images: [{ url: socialImage, width: 1536, height: 1024, alt: guide.heroAlt ?? guide.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: guide.title,
      description: guide.description,
      images: [socialImage],
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

  const [fallbackProducts, liveProducts] = await Promise.all([
    loadGuideProducts(guide, pricingContext),
    loadLiveGuideProducts(guide.slug, pricingContext).catch(() => []),
  ]);
  const products = (liveProducts.length ? liveProducts : fallbackProducts).slice(0, guide.catalog.limit);
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
      heroImage: guide.heroImage,
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

  const renderSection = (section: (typeof guide.sections)[number]) => (
    <section className={styles.editorialSection} key={section.title}>
      <p className={styles.sectionKicker}>{section.eyebrow}</p>
      <h2>{section.title}</h2>
      <div className={styles.sectionCopy}>
        {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
        {section.bullets ? <ul>{section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}</ul> : null}
        {section.quote ? <blockquote>{section.quote}</blockquote> : null}
      </div>
    </section>
  );

  return (
    <>
      <main className={styles.articlePage} data-tone={guide.heroTone}>
        <JsonLd data={schemas} />
        <GuideViewTracker guideSlug={guide.slug} />

        <nav className={styles.breadcrumbs} aria-label="Migas de pan">
          <Link href="/">Inicio</Link><span>/</span><Link href="/guias">Guías</Link><span>/</span><span>{guide.cluster}</span>
        </nav>

        <header className={styles.articleHeader}>
          <p className={styles.articleKicker}>{guide.eyebrow}</p>
          <h1>{guide.title}</h1>
          <p className={styles.articleDek}>{guide.dek}</p>
          <dl className={styles.articleMeta}>
            <div><dt>PUBLICADO</dt><dd>{formattedDate(guide.publishedAt)}</dd></div>
            <div><dt>LECTURA</dt><dd>{guide.readingMinutes} MIN</dd></div>
            <div><dt>POR</dt><dd>LOMBARDO.</dd></div>
          </dl>
        </header>

        <GuideHeroVisual
          image={guide.heroImage}
          alt={guide.heroAlt}
          caption={guide.heroCaption ?? guide.visualCaptions[0]}
          products={products}
        />

        <article className={styles.articleBody}>
          <div className={styles.standfirst}>
            <p>{guide.intro}</p>
            <aside>
              <span>COMPARTIR ESTA HISTORIA</span>
              <GuideShare guideSlug={guide.slug} title={guide.title} />
            </aside>
          </div>

          <div className={styles.editorialSections}>
            {guide.sections.slice(0, 2).map(renderSection)}
          </div>

          <GuideVisualMoment
            image={guide.heroImage}
            alt=""
            products={products.slice(2, 4)}
            caption={guide.visualCaptions[1]}
            index={1}
          />
        </article>

        <GuideProductGrid
          products={products}
          heading={guide.catalog.heading}
          description={guide.catalog.description}
          guideSlug={guide.slug}
          allHref={guide.catalog.allHref}
          allLabel={guide.catalog.allLabel}
        />

        <article className={styles.articleBody}>
          <div className={styles.editorialSections}>
            {guide.sections.slice(2).map(renderSection)}
          </div>
          <footer className={styles.articleClose}>
            <p>PARA QUEDARSE CON UNA IDEA</p>
            <blockquote>{guide.visualCaptions[0]}</blockquote>
            <Link href={guide.catalog.allHref}>VER LA SELECCIÓN COMPLETA →</Link>
          </footer>
        </article>

        <section className={styles.relatedStories} aria-labelledby="related-title">
          <p>LECTURAS RELACIONADAS</p>
          <h2 id="related-title">Seguir leyendo.</h2>
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

        <section className={styles.commercialCta}>
          <p>¿QUERÉS RESOLVERLO CON ALGUIEN?</p>
          <h2>Contanos la ocasión. Nosotros acortamos la lista.</h2>
          <div>
            <Link href={guide.catalog.allHref}>VER CATÁLOGO →</Link>
            <Link href="/#contacto">HABLAR CON LOMBARDO ↗</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
