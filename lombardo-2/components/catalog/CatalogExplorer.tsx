"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import {
  availabilityLabels,
  canAddToCart,
  getAddLabel,
} from "@/lib/commerce/availability";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Category, Product } from "@/types/commerce";
import styles from "./CatalogExplorer.module.css";

type CatalogMode = "editorial" | "list";

interface CatalogExplorerProps {
  products: Product[];
  categories: Category[];
  initialCategory?: string;
}

const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();

function ProductInfo({ product }: { product: Product }) {
  const { addItem } = useCart();
  const isAddable = canAddToCart(product.availability);

  return (
    <div className={styles.productInfo}>
      <div>
        <p className={styles.productEyebrow}>
          {product.brand.name} · {product.presentation}
        </p>
        <h2>
          <Link href={`/productos/${product.slug}`}>{product.name}</Link>
        </h2>
        <p
          className={styles.availability}
          data-status={product.availability}
        >
          {availabilityLabels[product.availability]}
        </p>
      </div>
      <div className={styles.priceBlock}>
        {product.compareAtPrice ? (
          <del>{formatCurrency(product.compareAtPrice)}</del>
        ) : null}
        <strong>{formatCurrency(product.price)}</strong>
      </div>
      <button
        type="button"
        disabled={!isAddable}
        aria-label={`${getAddLabel(product.availability)}: ${product.name}`}
        onClick={() => addItem(product)}
      >
        {getAddLabel(product.availability)}
        <span className={styles.addMark} aria-hidden="true" />
      </button>
    </div>
  );
}

export function CatalogExplorer({
  products,
  categories,
  initialCategory = "todos",
}: CatalogExplorerProps) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(initialCategory);
  const [mode, setMode] = useState<CatalogMode>("editorial");
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = normalize(deferredQuery);

  const visibleProducts = products.filter((product) => {
    if (category !== "todos" && product.category.slug !== category) return false;
    if (!normalizedQuery) return true;

    return normalize(
      [
        product.name,
        product.brand.name,
        product.category.name,
        product.presentation,
        ...product.tags,
      ].join(" "),
    ).includes(normalizedQuery);
  });

  return (
    <main className={styles.catalogPage}>
      <header className={styles.catalogHero}>
        <div className={styles.heroKicker}>
          <span>CATÁLOGO / 01</span>
          <span>ROSARIO</span>
        </div>
        <h1>
          <span>TODO LO</span>
          <span>BUENO.</span>
        </h1>
        <div className={styles.heroAside}>
          <p>Para regalar, llevar o quedártelo.</p>
          <p>Explorá por gusto o encontrá eso que ya tenés en mente.</p>
        </div>
      </header>

      <section className={styles.catalogSection} aria-labelledby="catalog-title">
        <div className={styles.controlsTop}>
          <div className={styles.searchField}>
            <label htmlFor="catalog-search">¿Qué estás buscando?</label>
            <div>
              <input
                id="catalog-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Vino, marca, regalo..."
              />
              <span aria-hidden="true">↗</span>
            </div>
          </div>

          <div
            className={styles.modeSwitch}
            role="group"
            aria-label="Densidad del catálogo"
          >
            <span>VER COMO</span>
            {(["editorial", "list"] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={mode === option}
                onClick={() => setMode(option)}
              >
                {option === "editorial" ? "EDITORIAL" : "LISTA"}
              </button>
            ))}
          </div>
        </div>

        <div
          className={styles.categoryBar}
          role="group"
          aria-label="Filtrar por categoría"
        >
          <button
            type="button"
            aria-pressed={category === "todos"}
            onClick={() => setCategory("todos")}
          >
            TODO
          </button>
          {categories.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.slug}
              onClick={() => setCategory(item.slug)}
            >
              {item.name}
            </button>
          ))}
        </div>

        <div className={styles.resultsHeading}>
          <h2 id="catalog-title">SELECCIÓN LOMBARDO</h2>
          <p aria-live="polite">
            {String(visibleProducts.length).padStart(2, "0")} PRODUCTOS
          </p>
        </div>

        {visibleProducts.length ? (
          <div
            className={mode === "editorial" ? styles.editorialGrid : styles.listGrid}
          >
            {visibleProducts.map((product, index) => (
              <article
                key={product.id}
                className={`${styles.product} ${
                  product.featured ? styles.featuredProduct : ""
                }`}
                data-index={String(index + 1).padStart(2, "0")}
              >
                <Link
                  className={styles.visualLink}
                  href={`/productos/${product.slug}`}
                  aria-label={`Ver ${product.name}`}
                >
                  <ProductVisual
                    product={product}
                    variant={mode === "editorial" ? "editorial" : "list"}
                    priority={index < 2}
                  />
                </Link>
                <ProductInfo product={product} />
              </article>
            ))}
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span>00</span>
            <p>No encontramos eso. Probá con otra palabra o categoría.</p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("todos");
              }}
            >
              VER TODO →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
