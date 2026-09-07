"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import { shouldShowWholesaleProgress, wholesaleBottleCount } from "@/lib/pricing/volume-tier-ui";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Product } from "@/types/commerce";
import styles from "./WholesaleRecommendations.module.css";

export function WholesaleRecommendations() {
  const { items, addItem } = useCart();
  const [result, setResult] = useState<{ key: string; products: Product[] }>({
    key: "",
    products: [],
  });
  const bottleCount = wholesaleBottleCount(items);
  const shouldLoad = shouldShowWholesaleProgress(items) && bottleCount >= 3 && bottleCount <= 5;
  const productIds = useMemo(
    () => items.map((item) => item.product.id).toSorted().join(","),
    [items],
  );

  useEffect(() => {
    if (!shouldLoad || !productIds) return;
    const controller = new AbortController();
    void fetch("/api/wholesale/recommendations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productIds: productIds.split(",") }),
      signal: controller.signal,
    })
      .then(async (response) => response.ok
        ? response.json() as Promise<{ products: Product[] }>
        : { products: [] })
      .then((response) => setResult({ key: productIds, products: response.products }))
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          setResult({ key: productIds, products: [] });
        }
      });
    return () => controller.abort();
  }, [productIds, shouldLoad]);

  const products = shouldLoad && result.key === productIds ? result.products : [];
  if (!products.length) return null;
  const missing = 6 - bottleCount;

  return (
    <section className={styles.recommendations} aria-labelledby="wholesale-recommendations-title">
      <div className={styles.heading}>
        <p>PARA COMPLETAR LAS 6</p>
        <h2 id="wholesale-recommendations-title">
          Te {missing === 1 ? "falta una" : `faltan ${missing}`}.
        </h2>
        <span>Opciones cercanas al rango de precio que venís eligiendo.</span>
      </div>
      <div className={styles.grid}>
        {products.slice(0, Math.max(3, missing)).map((product) => (
          <article key={product.id}>
            <Link
              href={`/productos/${product.slug}`}
              onClick={() => trackCommerceEvent({
                name: "wholesale_recommendation_clicked",
                bottleCount,
                productId: product.id,
              })}
            >
              <ProductVisual product={product} variant="cart" />
            </Link>
            <div>
              <p>{product.brand.name}</p>
              <h3>{product.name}</h3>
              <strong>{formatCurrency(product.price)}</strong>
              <button
                type="button"
                onClick={() => {
                  trackCommerceEvent({
                    name: "wholesale_recommendation_clicked",
                    bottleCount,
                    productId: product.id,
                  });
                  addItem(product, 1, { openCart: false });
                }}
              >SUMAR +</button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
