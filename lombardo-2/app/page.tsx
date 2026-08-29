import type { Metadata } from "next";
import { Footer } from "@/components/layout/Footer";
import { CommercialDiscovery } from "@/components/home/CommercialDiscovery";
import { FirstAct } from "@/components/home/FirstAct";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import type { CustomerPricingContext } from "@/lib/server/customers/types";
import type { Category } from "@/types/commerce";
import styles from "./page.module.css";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
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
            { categorySlug, limit: 2 },
            pricingContext,
          ),
        ),
      ),
    ]);

    return {
      categories,
      products: pages.flatMap((page) => page.products).slice(0, 6),
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
  const discovery = await loadCommercialDiscovery(pricingContext);

  return (
    <>
      <main className={styles.home}>
        <FirstAct />
        <CommercialDiscovery {...discovery} />
      </main>
      <Footer />
    </>
  );
}
