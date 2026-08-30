import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { JsonLd } from "@/components/seo/JsonLd";
import { FEATURED_GUIDES, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import styles from "./guides.module.css";

export const metadata: Metadata = {
  title: "Guías para elegir vinos, destilados y regalos",
  description: "Historias, recomendaciones y cosas que vale la pena saber para elegir vinos, regalos y destilados con criterio Lombardo.",
  alternates: { canonical: "/guias" },
  openGraph: {
    title: "Guías: para elegir mejor | LOMBARDO.",
    description: "La publicación editorial de Lombardo sobre vinos, regalos, destilados y ocasiones.",
    url: "/guias",
    type: "website",
    images: [{ url: FEATURED_GUIDES[0].heroImage!, width: 1536, height: 1024, alt: FEATURED_GUIDES[0].heroAlt }],
  },
};

function StoryImage({
  guide,
  priority = false,
  sizes,
}: {
  guide: (typeof FEATURED_GUIDES)[number];
  priority?: boolean;
  sizes: string;
}) {
  return guide.heroImage ? (
    <Image
      src={guide.heroImage}
      alt={guide.heroAlt ?? ""}
      fill
      priority={priority}
      sizes={sizes}
      style={{ objectFit: "cover" }}
    />
  ) : null;
}

export default function GuidesPage() {
  const [lead, price, malbec, gift, asado] = FEATURED_GUIDES;
  const foundations = PUBLISHED_GUIDES.filter((guide) => !guide.featured);

  return (
    <>
      <main className={styles.hubPage}>
        <JsonLd data={breadcrumbStructuredData([{ name: "Inicio", path: "/" }, { name: "Guías", path: "/guias" }])} />

        <header className={styles.hubHeader}>
          <div className={styles.hubMasthead}>
            <p>LOMBARDO / EDITORIAL</p>
            <span>ROSARIO · EDICIÓN 01 · 2026</span>
          </div>
          <div className={styles.hubTitle}>
            <p>GUÍAS</p>
            <h1>Para elegir mejor.</h1>
            <p>Historias, recomendaciones y cosas que vale la pena saber sobre vinos, regalos, destilados y las mesas que los reúnen.</p>
          </div>
        </header>

        <section className={styles.cover} aria-label="Historias destacadas">
          <article className={styles.coverLead}>
            <Link className={styles.coverLeadImage} href={`/guias/${lead.slug}`}>
              <StoryImage guide={lead} priority sizes="(max-width: 900px) 100vw, 66vw" />
            </Link>
            <div className={styles.coverLeadCopy}>
              <p>{lead.eyebrow} · {lead.readingMinutes} MIN</p>
              <h2><Link href={`/guias/${lead.slug}`}>{lead.title}</Link></h2>
              <p>{lead.dek}</p>
              <Link href={`/guias/${lead.slug}`}>LEER LA HISTORIA →</Link>
            </div>
          </article>

          <div className={styles.coverSecondary}>
            {[price, malbec].map((guide, index) => (
              <article className={styles.secondaryStory} key={guide.slug}>
                <Link className={styles.secondaryImage} href={`/guias/${guide.slug}`}>
                  <StoryImage guide={guide} sizes="(max-width: 768px) 100vw, 50vw" />
                </Link>
                <div>
                  <p>{String(index + 2).padStart(2, "0")} / {guide.cluster} · {guide.readingMinutes} MIN</p>
                  <h2><Link href={`/guias/${guide.slug}`}>{guide.cardTitle}</Link></h2>
                  <p>{guide.dek}</p>
                  <Link href={`/guias/${guide.slug}`}>LEER →</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.latest} aria-labelledby="latest-title">
          <header>
            <p>ÚLTIMAS HISTORIAS</p>
            <h2 id="latest-title">Dos maneras de quedar bien sin actuar de experto.</h2>
          </header>
          <div>
            {[gift, asado].map((guide, index) => (
              <article className={styles.latestStory} key={guide.slug}>
                <Link className={styles.latestImage} href={`/guias/${guide.slug}`}>
                  <StoryImage guide={guide} sizes="(max-width: 768px) 100vw, 50vw" />
                </Link>
                <div>
                  <p>{String(index + 4).padStart(2, "0")} / {guide.eyebrow} · {guide.readingMinutes} MIN</p>
                  <h3><Link href={`/guias/${guide.slug}`}>{guide.cardTitle}</Link></h3>
                  <p>{guide.dek}</p>
                  <Link href={`/guias/${guide.slug}`}>LEER LA NOTA →</Link>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.editorialStatement}>
          <p>EL CRITERIO LOMBARDO</p>
          <blockquote>“No escribimos para que rindas examen. Escribimos para que la próxima botella tenga una razón.”</blockquote>
        </section>

        <nav className={styles.foundationLinks} aria-label="Guías de servicio para comprar y regalar en Rosario">
          <p>GUÍAS DE SERVICIO</p>
          {foundations.map((guide) => (
            <Link href={`/guias/${guide.slug}`} key={guide.slug}>{guide.cardTitle} <span>→</span></Link>
          ))}
        </nav>
      </main>
      <Footer />
    </>
  );
}
