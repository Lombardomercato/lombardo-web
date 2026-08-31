import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { OpportunityGrid } from "@/components/opportunities/OpportunityGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { commerceProvider } from "@/lib/commerce";
import { breadcrumbStructuredData, productStructuredData } from "@/lib/seo/structured-data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function products() {
  return commerceProvider.getActiveOpportunities(48);
}

export async function generateMetadata(): Promise<Metadata> {
  const active = await products().catch(() => []);
  const indexable = process.env.VERCEL_ENV === "production" && active.length >= 4;
  return {
    title: "Oportunidades en vinos y bebidas",
    description: "Una selección vigente de vinos y bebidas con precios Lombardo especialmente competitivos.",
    alternates: { canonical: "/oportunidades" },
    robots: { index: indexable, follow: indexable },
    openGraph: {
      title: "Oportunidades | LOMBARDO.",
      description: "Botellas conocidas, elegidas cuando el precio acompaña de verdad.",
      url: "/oportunidades",
      type: "website",
    },
  };
}

export default async function OpportunitiesPage() {
  const active = await products();
  return (
    <>
      <JsonLd data={[
        breadcrumbStructuredData([
          { name: "Inicio", path: "/" },
          { name: "Oportunidades", path: "/oportunidades" },
        ]),
        ...active.map(productStructuredData),
      ]} />
      <main className={styles.page}>
        <header className={styles.hero}>
          <p>PRECIO REAL · SELECCIÓN VIGENTE</p>
          <h1>OPORTUNIDADES.</h1>
          <div>
            <p>Una selección breve de productos conocidos que hoy tienen un precio especialmente bueno.</p>
            <span>{active.length.toLocaleString("es-AR")} PRODUCTOS</span>
          </div>
        </header>
        <section className={styles.products} aria-label="Oportunidades vigentes">
          {active.length ? (
            <OpportunityGrid products={active} surface="opportunities" />
          ) : (
            <p className={styles.empty}>Estamos revisando la próxima selección. Volvé pronto.</p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
