"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import { canAddToCart, getAddLabel } from "@/lib/commerce/availability";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Product } from "@/types/commerce";
import styles from "./GuideProductGrid.module.css";

interface GuideProductGridProps {
  products: Product[];
  heading: string;
  description: string;
  guideSlug: string;
  allHref: string;
  allLabel: string;
}

export function GuideProductGrid({
  products,
  heading,
  description,
  guideSlug,
  allHref,
  allLabel,
}: GuideProductGridProps) {
  const { addItem } = useCart();

  return (
    <section className={styles.section} aria-labelledby="guide-products-title">
      <div className={styles.heading}>
        <p>SELECCIÓN LOMBARDO · CATÁLOGO VIVO</p>
        <h2 id="guide-products-title">{heading}</h2>
        <div>
          <p>{description}</p>
          <Link href={allHref}>{allLabel} →</Link>
        </div>
      </div>

      <div className={styles.grid}>
        {products.map((product, index) => {
          const isAddable = canAddToCart(product.availability);
          return (
            <article className={styles.card} key={product.id}>
              <Link
                className={styles.visualLink}
                href={`/productos/${product.slug}`}
                aria-label={`Ver ${product.name}`}
                onClick={() =>
                  trackCommerceEvent({
                    name: "guide_product_click",
                    guideSlug,
                    productId: product.id,
                  })
                }
              >
                <span className={styles.index}>{String(index + 1).padStart(2, "0")}</span>
                <ProductVisual product={product} priority={index < 2} />
              </Link>
              <div className={styles.cardCopy}>
                <p>{product.brand.name} · {product.presentation}</p>
                <h3>
                  <Link
                    href={`/productos/${product.slug}`}
                    onClick={() =>
                      trackCommerceEvent({
                        name: "guide_product_click",
                        guideSlug,
                        productId: product.id,
                      })
                    }
                  >
                    {product.name}
                  </Link>
                </h3>
                <div className={styles.buyRow}>
                  <strong>{formatCurrency(product.price)}</strong>
                  <button
                    type="button"
                    disabled={!isAddable}
                    onClick={() => {
                      trackCommerceEvent({ name: "guide_add_to_cart", guideSlug, productId: product.id });
                      addItem(product, 1);
                    }}
                  >
                    {isAddable ? "AGREGAR" : getAddLabel(product.availability).toUpperCase()}
                    <span aria-hidden="true">＋</span>
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <p className={styles.liveNote}>
        Precios y elegibilidad se consultan en Runia. Si una botella deja de estar SAFE,
        desaparece de esta selección y ocupa su lugar otra disponible.
      </p>
    </section>
  );
}
