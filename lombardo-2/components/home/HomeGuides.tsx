import Link from "next/link";
import { ProductVisual } from "@/components/product/ProductVisual";
import { FEATURED_GUIDES } from "@/lib/seo/guides";
import type { Product } from "@/types/commerce";
import styles from "./HomeGuides.module.css";

export function HomeGuides({ products }: { products: Product[] }) {
  const guides = FEATURED_GUIDES.slice(0, 3);
  return (
    <section className={styles.section} aria-labelledby="home-guides-title">
      <header>
        <div>
          <p>GUÍAS / PARA ELEGIR MEJOR</p>
          <h2 id="home-guides-title">ALGO PARA LEER ANTES DE ELEGIR.</h2>
        </div>
        <Link href="/guias">VER TODAS LAS GUÍAS →</Link>
      </header>
      <div className={styles.grid}>
        {guides.map((guide, index) => (
          <article key={guide.slug}>
            <Link className={styles.visual} href={`/guias/${guide.slug}`}>
              {products[index] ? <ProductVisual product={products[index]} /> : <span>{String(index + 1).padStart(2, "0")}</span>}
            </Link>
            <div>
              <p>{guide.cluster} · {guide.readingMinutes} MIN</p>
              <h3><Link href={`/guias/${guide.slug}`}>{guide.cardTitle}</Link></h3>
              <Link href={`/guias/${guide.slug}`}>LEER →</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
