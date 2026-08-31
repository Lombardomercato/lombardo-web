"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { QuantityControl } from "@/components/cart/QuantityControl";
import { useCart } from "@/components/cart/CartProvider";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import {
  availabilityLabels,
  canAddToCart,
  getAddLabel,
} from "@/lib/commerce/availability";
import type { Product } from "@/types/commerce";
import { ProductVisual } from "./ProductVisual";
import { OpportunityPrice } from "@/components/opportunities/OpportunityPrice";
import styles from "./ProductDetail.module.css";

export function ProductDetail({ product }: { product: Product }) {
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();
  const isAddable = canAddToCart(product.availability);
  const isOpportunity = Boolean(product.opportunity);
  const detailAddLabel =
    product.availability === "AVAILABLE_NOW"
      ? "AGREGAR AL CARRITO"
      : getAddLabel(product.availability).toUpperCase();

  useEffect(() => {
    trackCommerceEvent({ name: "view_item", productId: product.id });
    if (isOpportunity) {
      trackCommerceEvent({ name: "opportunity_view", productId: product.id, surface: "product" });
    }
  }, [isOpportunity, product.id]);

  return (
    <main
      className={styles.page}
      data-situations={product.situations.join(",")}
      data-gift-levels={product.giftLevels.join(",")}
      data-recommendation-tags={product.tags.join(",")}
    >
      <div className={styles.topline}>
        <Link href="/productos">← VOLVER AL CATÁLOGO</Link>
        <span>FICHA / {product.sku.slice(-3)}</span>
      </div>

      <header className={styles.heading}>
        <p>{product.category.name} · {product.brand.name}</p>
        <h1>{product.name}</h1>
      </header>

      <div className={styles.composition}>
        <div className={styles.visualColumn}>
          <ProductVisual product={product} variant="detail" priority />
          <div className={styles.visualFoot}>
            <span>{product.category.name}</span>
            <span>{product.sku.replaceAll("-", " ")}</span>
          </div>
        </div>

        <section className={styles.purchase} aria-labelledby="purchase-title">
          <div className={styles.availabilityRow}>
            <span
              className={styles.statusDot}
              data-status={product.availability}
              aria-hidden="true"
            />
            <p>{availabilityLabels[product.availability]}</p>
          </div>

          <div className={styles.price} id="purchase-title">
            <OpportunityPrice product={product} size="detail" />
          </div>

          <div className={styles.purchaseActions}>
            <div className={styles.quantityRow}>
              <span>CANTIDAD</span>
              <QuantityControl
                label={product.name}
                quantity={quantity}
                onChange={setQuantity}
              />
            </div>
            <button
              className={styles.addButton}
              type="button"
              disabled={!isAddable}
              onClick={() => addItem(product, quantity)}
            >
              <span>{detailAddLabel}</span>
              <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className={styles.productCopy}>
            {product.description ? <p>{product.description}</p> : null}
            <dl>
              <div>
                <dt>MARCA</dt>
                <dd>{product.brand.name}</dd>
              </div>
              <div>
                <dt>PRESENTACIÓN</dt>
                <dd>{product.presentation}</dd>
              </div>
              <div>
                <dt>CATEGORÍA</dt>
                <dd>{product.category.name}</dd>
              </div>
            </dl>
          </div>
        </section>
      </div>
    </main>
  );
}
