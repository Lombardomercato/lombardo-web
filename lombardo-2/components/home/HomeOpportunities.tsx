import Link from "next/link";
import { OpportunityGrid } from "@/components/opportunities/OpportunityGrid";
import type { Product } from "@/types/commerce";
import styles from "./HomeOpportunities.module.css";

export function HomeOpportunities({ products }: { products: Product[] }) {
  if (!products.length) return null;

  return (
    <section className={styles.section} aria-labelledby="home-opportunities-title">
      <header>
        <div>
          <p>SELECCIÓN VIGENTE / PRECIO REAL</p>
          <h2 id="home-opportunities-title">OPORTUNIDADES.</h2>
        </div>
        <p>Botellas conocidas, elegidas cuando el precio acompaña de verdad.</p>
        <Link href="/oportunidades">VER TODAS →</Link>
      </header>
      <OpportunityGrid products={products} surface="home" />
    </section>
  );
}
