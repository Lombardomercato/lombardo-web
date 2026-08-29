import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/seo/JsonLd";
import { GUIDE_CLUSTERS, PUBLISHED_GUIDES } from "@/lib/seo/guides";
import { breadcrumbStructuredData } from "@/lib/seo/structured-data";
import styles from "./guides.module.css";

export const metadata: Metadata = {
  title: "Guías para elegir vinos, destilados y regalos",
  description:
    "Guías Lombardo para comprar vinos online en Rosario, elegir regalos y encontrar opciones con catálogo y precios actualizados.",
  alternates: { canonical: "/guias" },
  openGraph: {
    title: "Guías para elegir y quedar bien | LOMBARDO.",
    description:
      "Ideas útiles conectadas al catálogo real de vinos, destilados y regalos de Lombardo.",
    url: "/guias",
    type: "website",
  },
};

export default function GuidesPage() {
  return (
    <main className={styles.page}>
      <JsonLd
        data={breadcrumbStructuredData([
          { name: "Inicio", path: "/" },
          { name: "Guías", path: "/guias" },
        ])}
      />
      <header className={styles.hero}>
        <p>GUÍAS LOMBARDO / 01</p>
        <h1>Elegir bien, sin saber de memoria.</h1>
        <p>
          Ideas concretas para comprar, regalar y resolver una mesa en Rosario.
        </p>
      </header>

      <section className={styles.clusters} aria-labelledby="clusters-title">
        <h2 id="clusters-title">El mapa que vamos a construir.</h2>
        <div className={styles.clusterGrid}>
          {GUIDE_CLUSTERS.map((cluster, index) => (
            <article key={cluster.name}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{cluster.name}</h3>
                <p>{cluster.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.guides} aria-labelledby="published-guides-title">
        <h2 id="published-guides-title">Primeras guías publicadas.</h2>
        <div className={styles.guideGrid}>
          {PUBLISHED_GUIDES.map((guide, index) => (
            <Link href={`/guias/${guide.slug}`} key={guide.slug}>
              <span>{String(index + 1).padStart(2, "0")} · {guide.cluster}</span>
              <div>
                <h3>{guide.title}</h3>
                <p>{guide.description}</p>
              </div>
              <strong>LEER Y VER PRODUCTOS →</strong>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
