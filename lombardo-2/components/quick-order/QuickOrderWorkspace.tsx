"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { useCart } from "@/components/cart/CartProvider";
import type { RevalidatedRepeatOrder } from "@/lib/quick-order/repeat-order";
import type {
  QuickOrderAccountType,
  QuickOrderProduct,
  QuickOrderSearchResult,
} from "@/lib/quick-order/types";
import type { RepeatableOrderSummary } from "@/lib/server/customers/customer-data";
import { formatCurrency } from "@/lib/utils/format-currency";

import styles from "./QuickOrderWorkspace.module.css";

interface QuickOrderWorkspaceProps {
  accountName: string;
  accountType: QuickOrderAccountType;
  latestOrder: RepeatableOrderSummary | null;
}

type SearchStatus = "idle" | "searching" | "ready" | "error";
type RepeatStatus = "idle" | "loading" | "success" | "error";

const accountLabels: Record<QuickOrderAccountType, string> = {
  WHOLESALE: "MAYORISTA",
  BUSINESS: "NEGOCIO",
};

const orderDate = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

function normalizedQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(Math.trunc(value), 1), 99);
}

export function QuickOrderWorkspace({
  accountName,
  accountType,
  latestOrder,
}: QuickOrderWorkspaceProps) {
  const {
    addItem,
    addItems,
    getFinalSubtotal,
    getItemCount,
    items,
    isCatalogLoading,
  } = useCart();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<QuickOrderProduct[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [truncated, setTruncated] = useState(false);
  const [repeatStatus, setRepeatStatus] = useState<RepeatStatus>("idle");
  const [repeatMessage, setRepeatMessage] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 160);
  const searchRef = useRef<HTMLInputElement>(null);
  const quantityRefs = useRef(new Map<string, HTMLInputElement>());
  const itemCount = getItemCount();
  const subtotal = getFinalSubtotal();

  useEffect(() => {
    if (!debouncedQuery) return;

    const controller = new AbortController();
    void fetch(
      `/api/quick-order/search?q=${encodeURIComponent(debouncedQuery)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const payload = (await response.json()) as
          | QuickOrderSearchResult
          | { error?: string };
        if (!response.ok || !("products" in payload)) {
          const message = "error" in payload ? payload.error : undefined;
          throw new Error(message || "search unavailable");
        }
        return payload;
      })
      .then((result) => {
        setProducts(result.products);
        setTruncated(result.truncated);
        setSearchStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setProducts([]);
        setSearchStatus("error");
      });

    return () => controller.abort();
  }, [debouncedQuery]);

  useEffect(() => {
    const focusSearchShortcut = (event: KeyboardEvent) => {
      const target = event.target;
      const editable =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      const commandK =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const slash = event.key === "/" && !editable;
      if (!commandK && !slash) return;
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", focusSearchShortcut);
    return () => window.removeEventListener("keydown", focusSearchShortcut);
  }, []);

  const focusQuantity = useCallback((index: number) => {
    const entry = products[index];
    if (!entry) return;
    const input = quantityRefs.current.get(entry.product.id);
    input?.focus();
    input?.select();
  }, [products]);

  const returnToSearch = useCallback(() => {
    setQuery("");
    setProducts([]);
    setQuantities({});
    setSearchStatus("idle");
    window.requestAnimationFrame(() => searchRef.current?.focus());
  }, []);

  const addProduct = useCallback(
    (entry: QuickOrderProduct) => {
      const quantity = quantities[entry.product.id] ?? 1;
      addItem(entry.product, normalizedQuantity(quantity), { openCart: false });
      returnToSearch();
    },
    [addItem, quantities, returnToSearch],
  );

  const onSearchKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if ((event.key === "Enter" || event.key === "ArrowDown") && products.length) {
      event.preventDefault();
      focusQuantity(0);
    }
    if (event.key === "Escape" && query) {
      event.preventDefault();
      returnToSearch();
    }
  };

  const onQuantityKeyDown = (
    event: ReactKeyboardEvent<HTMLInputElement>,
    entry: QuickOrderProduct,
    index: number,
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      addProduct(entry);
      return;
    }
    if (event.key === "ArrowDown" && index < products.length - 1) {
      event.preventDefault();
      focusQuantity(index + 1);
      return;
    }
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      focusQuantity(index - 1);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    }
  };

  const repeatLatestOrder = async () => {
    if (!latestOrder || repeatStatus === "loading") return;
    setRepeatStatus("loading");
    setRepeatMessage("Revalidando productos y precios actuales…");
    try {
      const response = await fetch("/api/quick-order/repeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderPublicId: latestOrder.publicId }),
      });
      const result = (await response.json()) as
        | RevalidatedRepeatOrder
        | { error?: string };
      if (!response.ok || !("items" in result)) {
        const message = "error" in result ? result.error : undefined;
        throw new Error(message || "repeat unavailable");
      }
      if (!result.items.length) {
        setRepeatStatus("error");
        setRepeatMessage(
          "Ese pedido ya no tiene productos elegibles para tu cuenta.",
        );
        return;
      }
      addItems(result.items, { openCart: false });
      setRepeatStatus("success");
      setRepeatMessage(
        result.skippedItemCount
          ? `Agregamos lo vigente. ${result.skippedItemCount} ${result.skippedItemCount === 1 ? "ítem no está disponible" : "ítems no están disponibles"} hoy.`
          : "Pedido cargado con productos y precios actuales.",
      );
      searchRef.current?.focus();
    } catch {
      setRepeatStatus("error");
      setRepeatMessage("No pudimos revalidar el pedido. Probá nuevamente.");
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span>PEDIDO RÁPIDO / B2B</span>
          <span>{accountLabels[accountType]} · {accountName}</span>
        </div>
        <div className={styles.heroCopy}>
          <h1>PEDIDO<br />RÁPIDO.</h1>
          <div>
            <p>Buscá, indicá cantidad y seguí con el próximo producto.</p>
            <p>Sin fotos. Precios resueltos para tu cuenta.</p>
          </div>
        </div>
        <nav className={styles.modeNav} aria-label="Modo de compra">
          <Link href="/productos">CATÁLOGO</Link>
          <Link href="/pedido-rapido" aria-current="page">PEDIDO RÁPIDO</Link>
        </nav>
      </header>

      <section className={styles.workspace} aria-labelledby="quick-search-label">
        <div className={styles.searchArea}>
          <div className={styles.searchBox}>
            <label id="quick-search-label" htmlFor="quick-order-search">
              PRODUCTO O MARCA
            </label>
            <div className={styles.searchInputRow}>
              <input
                ref={searchRef}
                id="quick-order-search"
                type="search"
                autoComplete="off"
                autoFocus
                value={query}
                onChange={(event) => {
                  const value = event.target.value;
                  setQuery(value);
                  setSearchStatus(value.trim() ? "searching" : "idle");
                  if (!value.trim()) {
                    setProducts([]);
                    setTruncated(false);
                  }
                }}
                onKeyDown={onSearchKeyDown}
                placeholder="Ej. El Enemigo, Rutini, ABS001B…"
                aria-describedby="quick-order-help quick-order-status"
              />
              <span aria-hidden="true">↗</span>
            </div>
            <p id="quick-order-help" className={styles.keyboardHelp}>
              <kbd>ENTER</kbd> seleccionar · <kbd>ENTER</kbd> agregar ·{" "}
              <kbd>ESC</kbd> volver · <kbd>⌘ K</kbd> buscar
            </p>
          </div>

          {latestOrder ? (
            <section className={styles.repeatOrder} aria-labelledby="repeat-title">
              <div>
                <p id="repeat-title">ÚLTIMO PEDIDO · #{latestOrder.displayId}</p>
                <span>
                  {orderDate.format(new Date(latestOrder.createdAt))} ·{" "}
                  {latestOrder.itemCount} unidades
                </span>
              </div>
              <button
                type="button"
                disabled={repeatStatus === "loading"}
                onClick={() => void repeatLatestOrder()}
              >
                {repeatStatus === "loading" ? "REVALIDANDO…" : "REPETIR CON PRECIOS DE HOY"}
              </button>
              {repeatMessage ? (
                <p
                  className={styles.repeatMessage}
                  role={repeatStatus === "error" ? "alert" : "status"}
                >
                  {repeatMessage}
                </p>
              ) : null}
            </section>
          ) : null}

          <div
            id="quick-order-status"
            className={styles.status}
            role="status"
            aria-live="polite"
          >
            {searchStatus === "searching"
              ? "BUSCANDO OPCIONES…"
              : searchStatus === "error"
                ? "NO PUDIMOS BUSCAR. REINTENTÁ."
                : debouncedQuery
                  ? `${products.length} ${products.length === 1 ? "RESULTADO" : "RESULTADOS"}${truncated ? " · AFINÁ LA BÚSQUEDA" : ""}`
                  : "ESCRIBÍ PARA EMPEZAR"}
          </div>

          {products.length ? (
            <div className={styles.tableWrap} aria-busy={searchStatus === "searching"}>
              <table className={styles.productTable}>
                <caption className="sr-only">
                  Resultados de productos para pedido rápido
                </caption>
                <thead>
                  <tr>
                    <th scope="col">PRODUCTO</th>
                    <th scope="col">PRESENTACIÓN</th>
                    <th scope="col">PÚBLICO</th>
                    <th scope="col">TU PRECIO</th>
                    <th scope="col">DISPONIBILIDAD</th>
                    <th scope="col">CANTIDAD</th>
                    <th scope="col"><span className="sr-only">Agregar</span></th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((entry, index) => {
                    const { product } = entry;
                    return (
                      <tr key={product.id}>
                        <th scope="row" data-label="PRODUCTO">
                          <strong>{product.name}</strong>
                          <span>{product.brand.name}</span>
                        </th>
                        <td data-label="PRESENTACIÓN">{product.presentation}</td>
                        <td data-label="PÚBLICO" className={styles.publicPrice}>
                          {entry.publicUnitPrice
                            ? formatCurrency(entry.publicUnitPrice)
                            : "—"}
                        </td>
                        <td data-label="TU PRECIO" className={styles.yourPrice}>
                          <strong>{formatCurrency(product.price)}</strong>
                          <span>{accountLabels[accountType]}</span>
                        </td>
                        <td data-label="DISPONIBILIDAD">
                          <span className={styles.availability}>
                            <i aria-hidden="true" /> A CONFIRMAR
                          </span>
                        </td>
                        <td data-label="CANTIDAD">
                          <label className="sr-only" htmlFor={`quantity-${product.id}`}>
                            Cantidad de {product.name}
                          </label>
                          <input
                            ref={(node) => {
                              if (node) quantityRefs.current.set(product.id, node);
                              else quantityRefs.current.delete(product.id);
                            }}
                            id={`quantity-${product.id}`}
                            className={styles.quantity}
                            type="number"
                            inputMode="numeric"
                            min="1"
                            max="99"
                            value={quantities[product.id] ?? 1}
                            onChange={(event) =>
                              setQuantities((current) => ({
                                ...current,
                                [product.id]: normalizedQuantity(
                                  event.currentTarget.valueAsNumber,
                                ),
                              }))
                            }
                            onKeyDown={(event) =>
                              onQuantityKeyDown(event, entry, index)}
                          />
                        </td>
                        <td className={styles.addCell}>
                          <button
                            type="button"
                            onClick={() => addProduct(entry)}
                            aria-label={`Agregar ${product.name} y volver a buscar`}
                          >
                            AGREGAR <span aria-hidden="true">+</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : debouncedQuery && searchStatus === "ready" ? (
            <div className={styles.empty}>
              <strong>SIN RESULTADOS.</strong>
              <p>Probá con otra parte del nombre o la marca.</p>
            </div>
          ) : null}

          <p className={styles.availabilityNote}>
            La disponibilidad se confirma antes de preparar el pedido.
            No expresa stock físico ni unidades por bulto.
          </p>
        </div>

        <aside className={styles.cartSummary} aria-label="Resumen del carrito">
          <div className={styles.cartHeading}>
            <p>TU PEDIDO</p>
            <span>{String(itemCount).padStart(2, "0")} UNIDADES</span>
          </div>
          <div className={styles.cartTotal}>
            <span>SUBTOTAL ACTUAL</span>
            <strong>{formatCurrency(subtotal)}</strong>
          </div>
          <p className={styles.cartMeta}>
            {items.length} {items.length === 1 ? "producto" : "productos"}
            {isCatalogLoading ? " · Actualizando precios…" : " · Precios de tu cuenta"}
          </p>
          <div className={styles.cartActions}>
            <Link href="/carrito">REVISAR CARRITO</Link>
            {itemCount ? (
              <Link className={styles.checkoutLink} href="/checkout">
                CONTINUAR AL CHECKOUT →
              </Link>
            ) : (
              <span className={styles.disabledCheckout}>CONTINUAR AL CHECKOUT →</span>
            )}
          </div>
        </aside>
      </section>
    </main>
  );
}
