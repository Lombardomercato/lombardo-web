import type { Metadata } from "next";
import Link from "next/link";
import { ProductVisual } from "@/components/product/ProductVisual";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/layout/Footer";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { loadGuideCoverProducts } from "@/lib/seo/guide-products";
import { FEATURED_GUIDES, GUIDE_CLUSTERS, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import type { Product } from "@/types/commerce";
import styles from "./guides.module.css";

export const metadata: Metadata = {
  title: "Guías para elegir vinos, destilados y regalos",
  description: "Historias, recomendaciones y cosas que vale la pena saber para elegir vinos, regalos y destilados con criterio Lombardo.",
  alternates: { canonical: "/guias" },
  openGraph: {
    title: "Guías: para elegir mejor | LOMBARDO.",
    description: "Una sección editorial sobre vinos, regalos, destilados y ocasiones. Sin examen y con catálogo vivo.",
    url: "/guias",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

async function getCoverProducts() {
  try {
    return await loadGuideCoverProducts(await getCurrentCustomerPricingContext());
  } catch {
    return [] as Product[];
  }
}

export default async function GuidesPage() {
  const coverProducts = await getCoverProducts();
  const lead = FEATURED_GUIDES[0];
  const foundations = PUBLISHED_GUIDES.filter((guide) => !guide.featured);

  return (
    <>
      <main className={styles.hubPage}>
        <JsonLd data={breadcrumbStructuredData([{ name: "Inicio", path: "/" }, { name: "Guías", path: "/guias" }])} />
        <header className={styles.hubHero}>
          <div className={styles.hubMasthead}>
            <p>LOMBARDO / EDITORIAL / 2026</p>
            <span>VINOS · REGALOS · DESTILADOS · OCASIONES</span>
          </div>
          <div>
            <p>GUÍAS</p>
            <h1>PARA<br /><em>ELEGIR</em><br />MEJOR.</h1>
          </div>
          <p className={styles.hubDek}>Historias, recomendaciones y cosas que vale la pena saber sobre vinos, regalos, destilados y ocasiones.</p>
        </header>

        <section className={styles.leadStory} aria-labelledby="lead-story-title">
          <div className={styles.leadVisual}>
            {coverProducts.slice(0, 2).map((product, index) => (
              <div key={product.id} data-index={index}><ProductVisual product={product} priority /></div>
            ))}
            <span aria-hidden="true">01</span>
          </div>
          <div className={styles.leadCopy}>
            <p>{lead.eyebrow} · {lead.readingMinutes} MIN</p>
            <h2 id="lead-story-title">{lead.title}</h2>
            <p>{lead.dek}</p>
            <Link href={`/guias/${lead.slug}`}>LEER LA HISTORIA <span aria-hidden="true">→</span></Link>
          </div>
        </section>

        <section className={styles.issue} aria-labelledby="issue-title">
          <div className={styles.issueHeading}>
            <p>PRIMERA EDICIÓN / CINCO PIEZAS</p>
            <h2 id="issue-title">Lo que estamos leyendo hoy.</h2>
          </div>
          <div className={styles.storyGrid}>
            {FEATURED_GUIDES.slice(1).map((guide, index) => {
              const product = coverProducts[index + 2];
              return (
                <article key={guide.slug} data-tone={guide.heroTone}>
                  <Link className={styles.storyVisual} href={`/guias/${guide.slug}`}>
                    {product ? <ProductVisual product={product} /> : <span aria-hidden="true">{String(index + 2).padStart(2, "0")}</span>}
                  </Link>
                  <div>
                    <p>{guide.eyebrow} · {guide.readingMinutes} MIN</p>
                    <h3><Link href={`/guias/${guide.slug}`}>{guide.cardTitle}</Link></h3>
                    <p>{guide.dek}</p>
                    <Link href={`/guias/${guide.slug}`}>LEER →</Link>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.manifesto}>
          <p>EL CRITERIO</p>
          <blockquote>“No escribimos para que tomes examen. Escribimos para que la próxima botella tenga una razón.”</blockquote>
          <div className={styles.clusterStrip}>
            {GUIDE_CLUSTERS.map((cluster, index) => (
              <div key={cluster.name}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{cluster.name}</h3>
                <p>{cluster.description}</p>
              </div>
            ))}
          </div>
        </section>

        <nav className={styles.foundationLinks} aria-label="Más guías para comprar y regalar en Rosario">
          <p>RESOLVER EN ROSARIO</p>
          {foundations.map((guide) => (
            <Link href={`/guias/${guide.slug}`} key={guide.slug}>{guide.cardTitle} <span>→</span></Link>
          ))}
        </nav>
      </main>
      <Footer />
    </>
  );
}
