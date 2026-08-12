"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ProductVisual } from "@/components/product/ProductVisual";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import { formatCurrency } from "@/lib/utils/format-currency";
import { useCart } from "./CartProvider";
import { QuantityControl } from "./QuantityControl";
import styles from "./CartPage.module.css";

export function CartPage() {
  const {
    items,
    isHydrated,
    isCatalogLoading,
    hasCatalogError,
    removeItem,
    updateQuantity,
    clearCart,
    getSubtotal,
    getItemCount,
    retryCatalog,
  } = useCart();
  const trackedViewRef = useRef(false);
  const subtotal = getSubtotal();
  const itemCount = getItemCount();

  useEffect(() => {
    if (!isHydrated || trackedViewRef.current) return;
    trackCommerceEvent({ name: "view_cart", itemCount, subtotal });
    trackedViewRef.current = true;
  }, [isHydrated, itemCount, subtotal]);

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.kicker}>
          <span>COMPRA / 02</span>
          <span>{String(itemCount).padStart(2, "0")} UNIDADES</span>
        </div>
        <h1>TU CARRITO.</h1>
        <p>Todo lo que elegiste, antes de seguir.</p>
      </header>

      {!isHydrated || isCatalogLoading ? (
        <p className={styles.loading} role="status">
          ACTUALIZANDO TU CARRITO CON RUNIA…
        </p>
      ) : hasCatalogError ? (
        <section className={styles.empty} role="alert">
          <span aria-hidden="true">!</span>
          <div>
            <h2>NO PUDIMOS ACTUALIZAR TU SELECCIÓN.</h2>
            <p>Nada se perdió. Probá nuevamente en un momento.</p>
            <button type="button" onClick={retryCatalog}>
              REINTENTAR →
            </button>
          </div>
        </section>
      ) : items.length ? (
        <div className={styles.layout}>
          <section className={styles.items} aria-label="Productos en el carrito">
            <div className={styles.itemsHeader}>
              <span>PRODUCTO</span>
              <button type="button" onClick={clearCart}>
                VACIAR CARRITO
              </button>
            </div>
            {items.map(({ product, quantity }, index) => (
              <article className={styles.item} key={product.id}>
                <span className={styles.index} aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <Link
                  className={styles.visualLink}
                  href={`/productos/${product.slug}`}
                  aria-label={`Ver ${product.name}`}
                >
                  <ProductVisual product={product} variant="cart" />
                </Link>
                <div className={styles.itemInfo}>
                  <div>
                    <p>{product.brand.name} · {product.presentation}</p>
                    <h2>
                      <Link href={`/productos/${product.slug}`}>{product.name}</Link>
                    </h2>
                  </div>
                  <span className={styles.unitPrice}>
                    {formatCurrency(product.price)} c/u
                  </span>
                  <div className={styles.itemActions}>
                    <QuantityControl
                      label={product.name}
                      quantity={quantity}
                      onChange={(nextQuantity) =>
                        updateQuantity(product.id, nextQuantity)
                      }
                    />
                    <button type="button" onClick={() => removeItem(product.id)}>
                      ELIMINAR
                    </button>
                  </div>
                  <strong className={styles.lineSubtotal}>
                    {formatCurrency(product.price * quantity)}
                  </strong>
                </div>
              </article>
            ))}
          </section>

          <aside className={styles.orderSummary} aria-labelledby="summary-title">
            <p id="summary-title">RESUMEN</p>
            <div>
              <span>{itemCount} {itemCount === 1 ? "unidad" : "unidades"}</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className={styles.total}>
              <span>TOTAL</span>
              <strong>{formatCurrency(subtotal)}</strong>
            </div>
            <Link className={styles.checkoutLink} href="/checkout">
              <span>CONTINUAR</span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/productos">← CONTINUAR COMPRANDO</Link>
          </aside>
        </div>
      ) : (
        <section className={styles.empty}>
          <span aria-hidden="true">00</span>
          <div>
            <h2>TODAVÍA NO HAY NADA ACÁ.</h2>
            <p>El catálogo está lleno de buenas decisiones.</p>
            <Link href="/productos">VER PRODUCTOS →</Link>
          </div>
        </section>
      )}
    </main>
  );
}
