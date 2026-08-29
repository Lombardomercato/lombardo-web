import Link from "next/link";
import { ProductVisual } from "@/components/product/ProductVisual";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Product } from "@/types/commerce";
import styles from "./GuideProductGrid.module.css";

export function GuideProductGrid({
  products,
  heading,
}: {
  products: Product[];
  heading: string;
}) {
  return (
    <section className={styles.section} aria-labelledby="guide-products-title">
      <div className={styles.heading}>
        <p>CATÁLOGO VIVO</p>
        <h2 id="guide-products-title">{heading}</h2>
        <Link href="/categorias/vinos">Ver todos los vinos →</Link>
      </div>

      <div className={styles.grid}>
        {products.map((product, index) => (
          <article className={styles.card} key={product.id}>
            <Link href={`/productos/${product.slug}`} aria-label={`Ver ${product.name}`}>
              <ProductVisual product={product} priority={index < 2} />
            </Link>
            <div>
              <p>{product.brand.name} · {product.presentation}</p>
              <h3>
                <Link href={`/productos/${product.slug}`}>{product.name}</Link>
              </h3>
              <strong>{formatCurrency(product.price)}</strong>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
