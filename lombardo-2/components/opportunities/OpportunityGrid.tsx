"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import { canAddToCart, getAddLabel } from "@/lib/commerce/availability";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import type { Product } from "@/types/commerce";
import { OpportunityPrice } from "./OpportunityPrice";
import styles from "./OpportunityGrid.module.css";

export function OpportunityGrid({ products, surface }: {
  products: Product[];
  surface: "home" | "opportunities";
}) {
  const { addItem } = useCart();
  useEffect(() => {
    for (const product of products) {
      trackCommerceEvent({ name: "opportunity_view", productId: product.id, surface });
    }
  }, [products, surface]);

  return (
    <div className={styles.grid} data-surface={surface}>
      {products.map((product, index) => {
        const href = `/productos/${product.slug}`;
        const addable = canAddToCart(product.availability);
        return (
          <article className={styles.card} key={product.id}>
            <Link
              className={styles.visual}
              href={href}
              aria-label={`Ver ${product.name}`}
              onClick={() => trackCommerceEvent({
                name: "opportunity_product_click",
                productId: product.id,
                surface,
              })}
            >
              <ProductVisual product={product} priority={surface === "opportunities" && index < 2} />
            </Link>
            <div className={styles.details}>
              <p>{product.brand.name} · {product.presentation}</p>
              <h2><Link href={href}>{product.name}</Link></h2>
              <OpportunityPrice product={product} />
              <button
                type="button"
                disabled={!addable}
                onClick={() => addItem(product)}
              >
                {getAddLabel(product.availability)} <span aria-hidden="true">＋</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
