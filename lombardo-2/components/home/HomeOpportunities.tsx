import Link from "next/link";
import { OpportunityGrid } from "@/components/opportunities/OpportunityGrid";
import type { Product } from "@/types/commerce";
import styles from "./HomeOpportunities.module.css";

export function HomeOpportunities({
  products,
  recommendedProductId,
}: {
  products: Product[];
  recommendedProductId?: string;
}) {
  if (!products.length) return null;

  return (
    <section className={styles.section} aria-labelledby="home-opportunities-title">
      <header>
        <div>
          <p>SELECCIÓN VIGENTE / PRECIO REAL</p>
          <h2 id="home-opportunities-title">OFERTAS.</h2>
        </div>
        <p>
          {recommendedProductId
            ? "Cinco oportunidades vigentes y un elegido Lombardo."
            : "Oportunidades: ofertas que realmente valen la pena."}
        </p>
        <Link href="/oportunidades">VER TODAS →</Link>
      </header>
      <OpportunityGrid
        products={products}
        surface="home"
        recommendedProductId={recommendedProductId}
      />
    </section>
  );
}
