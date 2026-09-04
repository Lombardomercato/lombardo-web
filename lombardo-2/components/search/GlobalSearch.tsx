"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Product } from "@/types/commerce";
import styles from "./GlobalSearch.module.css";

type SearchState = "idle" | "loading" | "ready" | "error";

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [state, setState] = useState<SearchState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.classList.add("search-open");
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 60);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
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
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.classList.remove("search-open");
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      returnFocusRef.current?.focus();
    };
  }, [onClose, open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState("loading");
      void fetch(`/api/catalog?q=${encodeURIComponent(term)}&limit=8`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("search unavailable");
          return (await response.json()) as { products: Product[] };
        })
        .then((result) => { setProducts(result.products); setState("ready"); })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setProducts([]);
          setState("error");
        });
    }, 250);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query]);

  const updateQuery = (value: string) => {
    setQuery(value);
    if (value.trim().length < 2) {
      setProducts([]);
      setState("idle");
    }
  };

  if (!open) return null;

  return (
    <div className={styles.layer} role="presentation">
      <button className={styles.backdrop} type="button" onClick={onClose} aria-label="Cerrar búsqueda" />
      <section ref={dialogRef} className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="global-search-title">
        <header>
          <p id="global-search-title">BUSCAR EN LOMBARDO</p>
          <button type="button" onClick={onClose}>CERRAR <span aria-hidden="true">×</span></button>
        </header>
        <div className={styles.searchRow}>
          <label className="sr-only" htmlFor="global-search-input">Producto, marca, bodega o categoría</label>
          <input ref={inputRef} id="global-search-input" type="search" value={query} onChange={(event) => updateQuery(event.target.value)} placeholder="Producto, marca, bodega o categoría" autoComplete="off" />
          {query ? <button type="button" onClick={() => updateQuery("")}>LIMPIAR</button> : null}
        </div>
        <div className={styles.results} aria-live="polite" aria-busy={state === "loading"}>
          {state === "idle" ? <p>Escribí al menos dos letras para buscar productos, marcas, bodegas o categorías.</p> : null}
          {state === "loading" ? <p>Buscando opciones…</p> : null}
          {state === "error" ? <p>No pudimos buscar ahora. Podés entrar al catálogo completo.</p> : null}
          {state === "ready" && !products.length ? <p>No encontramos coincidencias. Probá con otra palabra.</p> : null}
          {products.length ? (
            <div className={styles.resultList}>
              {products.map((product) => (
                <Link key={product.id} href={`/productos/${product.slug}`} onClick={onClose}>
                  <span>{product.brand.name} · {product.category.name}</span>
                  <strong>{product.name}</strong>
                  <b>{formatCurrency(product.price)}</b>
                </Link>
              ))}
            </div>
          ) : null}
        </div>
        <Link className={styles.allResults} href={`/productos${query.trim() ? `?buscar=${encodeURIComponent(query.trim())}` : ""}`} onClick={onClose}>
          VER CATÁLOGO {query.trim() ? "CON ESTA BÚSQUEDA" : "COMPLETO"} <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}
