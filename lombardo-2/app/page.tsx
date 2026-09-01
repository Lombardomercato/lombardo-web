import type { Metadata } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { Footer } from "@/components/layout/Footer";
import { CommercialDiscovery } from "@/components/home/CommercialDiscovery";
import { FirstAct } from "@/components/home/FirstAct";
import { HomeGuides } from "@/components/home/HomeGuides";
import { HomeOpportunities } from "@/components/home/HomeOpportunities";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { loadDailyHomeData } from "@/lib/server/automations/live-data";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { Category } from "@/types/commerce";
import { onlineStoreStructuredData } from "@/lib/seo/structured-data";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Comprar vinos online en Rosario",
  description:
    "Comprá vinos, destilados y regalos online en Rosario con catálogo y precios actualizados. Quedar bien es fácil.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Comprar vinos online en Rosario | LOMBARDO.",
    description:
      "Vinos, destilados y regalos para comprar online en Rosario con catálogo y precios actualizados.",
    url: "/",
    type: "website",
  },
};

export const dynamic = "force-dynamic";

const fallbackCategories: Category[] = [
  { id: "home-vinos", slug: "vinos", name: "Vinos" },
  { id: "home-destilados", slug: "destilados", name: "Destilados" },
  { id: "home-gourmet", slug: "gourmet", name: "Gourmet" },
  { id: "home-regalos", slug: "regalos", name: "Regalos y accesorios" },
];

async function loadCommercialDiscovery(pricingContext: CustomerPricingContext) {
  const categorySlugs = ["vinos", "destilados", "gourmet", "regalos"];

  try {
    const [categories, catalog, pages] = await Promise.all([
      commerceProvider.getCategories(),
      commerceProvider.getProductPage({ limit: 1 }, pricingContext),
      Promise.all(
        categorySlugs.map((categorySlug) =>
          commerceProvider.getProductPage(
            { categorySlug, limit: 2, requireImage: true },
            pricingContext,
          ),
        ),
      ),
    ]);

    const daily = await loadDailyHomeData(pricingContext, categories).catch(() => null);

    return {
      categories: daily?.categories ?? categories,
      products:
        daily?.products ??
        pages
          .flatMap((page) => page.products.filter((product) => product.images.length > 0).slice(0, 2))
          .slice(0, 6),
      catalogTotal: catalog.total,
    };
  } catch {
    return {
      categories: fallbackCategories,
      products: [],
      catalogTotal: null,
    };
  }
}

export default async function Home() {
  const pricingContext = await getCurrentCustomerPricingContext();
  const [discovery, opportunities] = await Promise.all([
    loadCommercialDiscovery(pricingContext),
    commerceProvider.getActiveOpportunities(6, pricingContext).catch(() => []),
  ]);

  return (
    <>
      <JsonLd data={onlineStoreStructuredData()} />
      <main className={styles.home}>
        <FirstAct />
        <HomeOpportunities products={opportunities} />
        <CommercialDiscovery {...discovery} />
        <HomeGuides />
      </main>
      <Footer />
    </>
  );
}
