import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { OpportunityGrid } from "@/components/opportunities/OpportunityGrid";
import { JsonLd } from "@/components/seo/JsonLd";
import { commerceProvider } from "@/lib/commerce";
import { completeOpportunitySelection } from "@/lib/commerce/opportunity-selection";
import { loadDailyHomeData } from "@/lib/server/automations/live-data";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { breadcrumbStructuredData, productStructuredData } from "@/lib/seo/structured-data";
import styles from "./page.module.css";

export const dynamic = "force-dynamic";

async function products() {
  return commerceProvider.getActiveOpportunities(48);
}

async function opportunitySelection() {
  const pricingContext = await getCurrentCustomerPricingContext();
  const [opportunities, categories, catalog] = await Promise.all([
    commerceProvider.getActiveOpportunities(6, pricingContext),
    commerceProvider.getCategories(),
    commerceProvider.getProductPage({ limit: 12 }, pricingContext),
  ]);
  const daily = await loadDailyHomeData(pricingContext, categories).catch(() => null);

  return completeOpportunitySelection(
    opportunities,
    daily?.products.length ? daily.products : catalog.products,
  );
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
  const selection = await opportunitySelection();
  const active = selection.products;
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
            <p>
              {selection.recommendedProductId
                ? "Cinco oportunidades vigentes y un elegido Lombardo para completar la selección."
                : "Una selección breve de productos conocidos que hoy tienen un precio especialmente bueno."}
            </p>
            <span>{active.length.toLocaleString("es-AR")} PRODUCTOS</span>
          </div>
        </header>
        <section className={styles.products} aria-label="Oportunidades vigentes">
          {active.length ? (
            <OpportunityGrid
              products={active}
              surface="opportunities"
              recommendedProductId={selection.recommendedProductId}
            />
          ) : (
            <p className={styles.empty}>Estamos revisando la próxima selección. Volvé pronto.</p>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
