"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import { formatCurrency } from "@/lib/utils/format-currency";
import { ProductVisual } from "@/components/product/ProductVisual";
import { QuantityControl } from "./QuantityControl";
import { useCart } from "./CartProvider";
import styles from "./CartDrawer.module.css";

const focusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function CartDrawer() {
  const {
    items,
    isCatalogLoading,
    hasCatalogError,
    isDrawerOpen,
    closeCart,
    removeItem,
    updateQuantity,
    getSubtotal,
    getItemCount,
    retryCatalog,
  } = useCart();
  const drawerRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const subtotal = getSubtotal();
  const itemCount = getItemCount();
  const cartSnapshotRef = useRef({ itemCount, subtotal });

  useEffect(() => {
    cartSnapshotRef.current = { itemCount, subtotal };
  }, [itemCount, subtotal]);

  useEffect(() => {
    if (!isDrawerOpen) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("cart-open");
    closeButtonRef.current?.focus();
    trackCommerceEvent({ name: "view_cart", ...cartSnapshotRef.current });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeCart();
        return;
      }

      if (event.key !== "Tab" || !drawerRef.current) return;
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
      );
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("cart-open");
      document.removeEventListener("keydown", onKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [closeCart, isDrawerOpen]);

  if (!isDrawerOpen) return null;

  return (
    <div className={styles.layer}>
      <button
        className={styles.backdrop}
        type="button"
        aria-label="Cerrar carrito"
        onClick={closeCart}
      />
      <aside
        ref={drawerRef}
        id="cart-drawer"
        className={styles.drawer}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-drawer-title"
      >
        <header className={styles.header}>
          <div>
            <p>COMPRA / EN CURSO</p>
            <h2 id="cart-drawer-title">TU CARRITO.</h2>
          </div>
          <button
            ref={closeButtonRef}
            className={styles.closeButton}
            type="button"
            onClick={closeCart}
            aria-label="Cerrar carrito"
          >
            CERRAR <span aria-hidden="true">×</span>
          </button>
        </header>

        {isCatalogLoading ? (
          <div className={styles.providerState} role="status">
            <span>ACTUALIZANDO</span>
            <p>Estamos confirmando tu selección.</p>
          </div>
        ) : hasCatalogError ? (
          <div className={styles.providerState} role="alert">
            <span>PAUSA</span>
            <p>No pudimos actualizar tu selección. Nada se perdió.</p>
            <button type="button" onClick={retryCatalog}>
              REINTENTAR →
            </button>
          </div>
        ) : items.length ? (
          <>
            <div className={styles.lines}>
              {items.map(({ product, quantity }) => (
                <article className={styles.line} key={product.id}>
                  <Link
                    className={styles.visualLink}
                    href={`/productos/${product.slug}`}
                    onClick={closeCart}
                    aria-label={`Ver ${product.name}`}
                  >
                    <ProductVisual product={product} variant="cart" />
                  </Link>
                  <div className={styles.lineInfo}>
                    <div>
                      <p>{product.brand.name}</p>
                      <h3>
                        <Link href={`/productos/${product.slug}`} onClick={closeCart}>
                          {product.name}
                        </Link>
                      </h3>
                      <span>{formatCurrency(product.price)} c/u</span>
                    </div>
                    <div className={styles.lineActions}>
                      <QuantityControl
                        label={product.name}
                        quantity={quantity}
                        onChange={(nextQuantity) =>
                          updateQuantity(product.id, nextQuantity)
                        }
                        inverse
                      />
                      <button type="button" onClick={() => removeItem(product.id)}>
                        ELIMINAR
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <footer className={styles.summary}>
              <div>
                <span>{String(itemCount).padStart(2, "0")} UNIDADES</span>
                <span>SUBTOTAL</span>
                <strong>{formatCurrency(subtotal)}</strong>
              </div>
              <Link href="/carrito" onClick={closeCart}>
                IR AL CARRITO <span aria-hidden="true">→</span>
              </Link>
            </footer>
          </>
        ) : (
          <div className={styles.empty}>
            <span aria-hidden="true">00</span>
            <p>Todavía no elegiste nada bueno.</p>
            <Link href="/productos" onClick={closeCart}>
              VER PRODUCTOS →
            </Link>
          </div>
        )}
      </aside>
    </div>
  );
}
