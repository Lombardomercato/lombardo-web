"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import {
  canAddToCart,
  getAddLabel,
} from "@/lib/commerce/availability";
import type { ProductPage } from "@/lib/commerce";
import type { Category, Product } from "@/types/commerce";
import styles from "./CatalogExplorer.module.css";
import { OpportunityPrice } from "@/components/opportunities/OpportunityPrice";

type CatalogMode = "editorial" | "list";
type CatalogStatus = "ready" | "filtering" | "loading-more" | "error";

interface CatalogExplorerProps {
  initialPage: ProductPage;
  categories: Category[];
  initialCategory?: string;
  heroTitle?: readonly [string, string];
  heroDescription?: readonly [string, string];
  quickOrderAvailable?: boolean;
  initialQuery?: string;
}

const DEFAULT_HERO_TITLE = ["TODO LO", "BUENO."] as const;
const DEFAULT_HERO_DESCRIPTION = [
  "Para regalar, llevar o quedártelo.",
  "Explorá por gusto o encontrá eso que ya tenés en mente.",
] as const;

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);

  return debounced;
}

async function fetchCatalogPage(input: {
  offset: number;
  limit: number;
  search: string;
  category: string;
  signal?: AbortSignal;
}) {
  const search = new URLSearchParams({
    offset: String(input.offset),
    limit: String(input.limit),
  });
  if (input.search.trim()) search.set("q", input.search.trim());
  if (input.category !== "todos") search.set("category", input.category);

  const response = await fetch(`/api/catalog?${search.toString()}`, {
    signal: input.signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("catalog unavailable");
  return (await response.json()) as ProductPage;
}

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
        {product.opportunity ? <p className={styles.offerBadge}>OFERTA VIGENTE</p> : null}
      </div>
      <div className={styles.priceBlock}>
        <OpportunityPrice product={product} />
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
  initialPage,
  categories,
  initialCategory = "todos",
  heroTitle = DEFAULT_HERO_TITLE,
  heroDescription = DEFAULT_HERO_DESCRIPTION,
  quickOrderAvailable = false,
  initialQuery = "",
}: CatalogExplorerProps) {
  const router = useRouter();
  const [query, setQuery] = useState(initialQuery);
  const category = initialCategory;
  const [mode, setMode] = useState<CatalogMode>("editorial");
  const [products, setProducts] = useState(initialPage.products);
  const [total, setTotal] = useState(initialPage.total);
  const [status, setStatus] = useState<CatalogStatus>("ready");
  const [retryRequest, setRetryRequest] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [brand, setBrand] = useState("todos");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [offersOnly, setOffersOnly] = useState(false);
  const [sort, setSort] = useState("relevance");
  const debouncedQuery = useDebouncedValue(query, 300);
  const firstRequest = useRef(true);
  const activeQuery = `${category}\u0000${debouncedQuery.trim()}`;
  const activeQueryRef = useRef(activeQuery);
  const loadMoreTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    activeQueryRef.current = activeQuery;
  }, [activeQuery]);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }

    const controller = new AbortController();
    const requestQuery = activeQuery;
    setStatus("filtering");
    setProducts([]);
    setTotal(0);

    void fetchCatalogPage({
      offset: 0,
      limit: initialPage.limit,
      search: debouncedQuery,
      category,
      signal: controller.signal,
    })
      .then((page) => {
        if (activeQueryRef.current !== requestQuery) return;
        setProducts(page.products);
        setTotal(page.total);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (activeQueryRef.current === requestQuery) setStatus("error");
      });

    return () => controller.abort();
  }, [activeQuery, category, debouncedQuery, initialPage.limit, retryRequest]);

  const loadMore = useCallback(async () => {
    if (status === "filtering" || status === "loading-more") return;
    if (products.length >= total) return;

    const requestQuery = activeQueryRef.current;
    setStatus("loading-more");
    try {
      const page = await fetchCatalogPage({
        offset: products.length,
        limit: initialPage.limit,
        search: debouncedQuery,
        category,
      });
      if (activeQueryRef.current !== requestQuery) return;
      setProducts((current) => {
        const known = new Set(current.map((product) => product.id));
        return [
          ...current,
          ...page.products.filter((product) => !known.has(product.id)),
        ];
      });
      setTotal(page.total);
      setStatus("ready");
    } catch {
      if (activeQueryRef.current === requestQuery) setStatus("error");
    }
  }, [category, debouncedQuery, initialPage.limit, products.length, status, total]);

  useEffect(() => {
    const target = loadMoreTarget.current;
    if (!target || products.length >= total || status !== "ready") return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void loadMore();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loadMore, products.length, status, total]);

  const filtering = status === "filtering";
  const loadingMore = status === "loading-more";
  const hasMore = products.length < total;
  const brands = useMemo(() => Array.from(new Set(products.map((product) => product.brand.name).filter(Boolean))).sort((a, b) => a.localeCompare(b, "es-AR")), [products]);
  const visibleProducts = useMemo(() => {
    const minimum = Number(minPrice);
    const maximum = Number(maxPrice);
    const filtered = products.filter((product) => {
      if (brand !== "todos" && product.brand.name !== brand) return false;
      if (minPrice && Number.isFinite(minimum) && product.price < minimum) return false;
      if (maxPrice && Number.isFinite(maximum) && product.price > maximum) return false;
      if (offersOnly && !product.opportunity) return false;
      return true;
    });
    return [...filtered].sort((left, right) => {
      if (sort === "price-asc") return left.price - right.price;
      if (sort === "price-desc") return right.price - left.price;
      if (sort === "name") return left.name.localeCompare(right.name, "es-AR");
      if (sort === "offers") return Number(Boolean(right.opportunity)) - Number(Boolean(left.opportunity));
      return 0;
    });
  }, [brand, maxPrice, minPrice, offersOnly, products, sort]);
  const activeFilterCount = Number(brand !== "todos") + Number(Boolean(minPrice)) + Number(Boolean(maxPrice)) + Number(offersOnly);
  const resetFilters = () => { setBrand("todos"); setMinPrice(""); setMaxPrice(""); setOffersOnly(false); };

  return (
    <main className={styles.catalogPage}>
      <header className={styles.catalogHero}>
        <div className={styles.heroKicker}>
          <span>CATÁLOGO / 01</span>
          <span>ROSARIO</span>
        </div>
        {quickOrderAvailable ? (
          <nav className={styles.purchaseModes} aria-label="Modo de compra">
            <Link href="/productos" aria-current="page">CATÁLOGO</Link>
            <Link href="/pedido-rapido">PEDIDO RÁPIDO</Link>
          </nav>
        ) : null}
        <h1>
          <span>{heroTitle[0]}</span>
          <span>{heroTitle[1]}</span>
        </h1>
        <div className={styles.heroAside}>
          <p>{heroDescription[0]}</p>
          <p>{heroDescription[1]}</p>
        </div>
      </header>

      <section
        className={styles.catalogSection}
        aria-labelledby="catalog-title"
        aria-busy={filtering || loadingMore}
      >
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
              {query ? <button type="button" onClick={() => setQuery("")}>LIMPIAR</button> : <span aria-hidden="true">↗</span>}
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

        <nav
          className={styles.categoryBar}
          aria-label="Categorías de productos"
        >
          <Link
            href="/productos"
            aria-current={category === "todos" ? "page" : undefined}
          >
            TODO
          </Link>
          {categories.map((item) => (
            <Link
              key={item.id}
              href={`/categorias/${item.slug}`}
              aria-current={category === item.slug ? "page" : undefined}
            >
              {item.name}
            </Link>
          ))}
        </nav>

        <div className={styles.mobileFilterBar}>
          <button type="button" onClick={() => setFiltersOpen(true)}>FILTROS{activeFilterCount ? ` · ${activeFilterCount}` : ""}</button>
          <label>
            <span>ORDENAR</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="relevance">RELEVANCIA</option>
              <option value="price-asc">PRECIO: MENOR A MAYOR</option>
              <option value="price-desc">PRECIO: MAYOR A MENOR</option>
              <option value="name">NOMBRE</option>
              <option value="offers">OFERTAS PRIMERO</option>
            </select>
          </label>
        </div>

        {filtersOpen ? <button className={styles.filterBackdrop} type="button" aria-label="Cerrar filtros" onClick={() => setFiltersOpen(false)} /> : null}
        <aside className={`${styles.filtersPanel} ${filtersOpen ? styles.filtersPanelOpen : ""}`} aria-label="Filtros del catálogo">
          <header><strong>FILTRAR PRODUCTOS</strong><button type="button" onClick={() => setFiltersOpen(false)}>CERRAR ×</button></header>
          <label><span>CATEGORÍA</span><select value={category} onChange={(event) => router.push(event.target.value === "todos" ? "/productos" : `/categorias/${event.target.value}`)}><option value="todos">TODAS</option>{categories.map((item) => <option key={item.id} value={item.slug}>{item.name.toUpperCase()}</option>)}</select></label>
          <label><span>MARCA / BODEGA</span><select value={brand} onChange={(event) => setBrand(event.target.value)}><option value="todos">TODAS LAS CARGADAS</option>{brands.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <div className={styles.priceFilters}><span>PRECIO</span><label><span className="sr-only">Precio mínimo</span><input type="number" min="0" inputMode="numeric" placeholder="DESDE" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} /></label><label><span className="sr-only">Precio máximo</span><input type="number" min="0" inputMode="numeric" placeholder="HASTA" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} /></label></div>
          <label className={styles.checkFilter}><input type="checkbox" checked={offersOnly} onChange={(event) => setOffersOnly(event.target.checked)} /><span>SÓLO OFERTAS VIGENTES</span></label>
          <label className={styles.desktopSort}><span>ORDENAR</span><select value={sort} onChange={(event) => setSort(event.target.value)}><option value="relevance">RELEVANCIA</option><option value="price-asc">PRECIO: MENOR A MAYOR</option><option value="price-desc">PRECIO: MAYOR A MENOR</option><option value="name">NOMBRE</option><option value="offers">OFERTAS PRIMERO</option></select></label>
          <footer><button type="button" onClick={resetFilters}>LIMPIAR FILTROS</button><button type="button" onClick={() => setFiltersOpen(false)}>VER {visibleProducts.length} PRODUCTOS</button></footer>
        </aside>

        {activeFilterCount || query || category !== "todos" ? (
          <div className={styles.activeFilters} aria-label="Filtros activos">
            {query ? <button type="button" onClick={() => setQuery("")}>BÚSQUEDA: {query} ×</button> : null}
            {category !== "todos" ? <Link href="/productos">{categories.find((item) => item.slug === category)?.name ?? category} ×</Link> : null}
            {brand !== "todos" ? <button type="button" onClick={() => setBrand("todos")}>{brand} ×</button> : null}
            {minPrice ? <button type="button" onClick={() => setMinPrice("")}>DESDE ${Number(minPrice).toLocaleString("es-AR")} ×</button> : null}
            {maxPrice ? <button type="button" onClick={() => setMaxPrice("")}>HASTA ${Number(maxPrice).toLocaleString("es-AR")} ×</button> : null}
            {offersOnly ? <button type="button" onClick={() => setOffersOnly(false)}>OFERTAS ×</button> : null}
          </div>
        ) : null}

        <div className={styles.resultsHeading}>
          <h2 id="catalog-title">SELECCIÓN LOMBARDO</h2>
          <p aria-live="polite">
            {filtering ? "BUSCANDO…" : activeFilterCount ? `${visibleProducts.length} DE ${products.length} CARGADOS` : `${total.toLocaleString("es-AR")} PRODUCTOS`}
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
        ) : filtering ? (
          <div className={styles.catalogFeedback} role="status">
            <span>LOM</span>
            <p>Buscando opciones…</p>
          </div>
        ) : (
          <div className={styles.emptyState}>
            <span>00</span>
            <p>
              {status === "error"
                ? "No pudimos actualizar la selección. La navegación sigue disponible."
                : "No encontramos eso. Probá con otra palabra o categoría."}
            </p>
            <button
              type="button"
              onClick={() => {
                if (status === "error") {
                  setRetryRequest((request) => request + 1);
                } else {
                  setQuery("");
                }
              }}
            >
              {status === "error" ? "REINTENTAR →" : "VER TODO →"}
            </button>
          </div>
        )}

        {products.length ? (
          <div className={styles.pagination} ref={loadMoreTarget}>
            {status === "error" ? (
              <>
                <p>No pudimos cargar la siguiente parte de la selección.</p>
                <button type="button" onClick={() => void loadMore()}>
                  REINTENTAR →
                </button>
              </>
            ) : hasMore ? (
              <button type="button" disabled={loadingMore} onClick={() => void loadMore()}>
                {loadingMore ? "CARGANDO…" : "VER MÁS →"}
              </button>
            ) : (
              <p>VISTE TODA LA SELECCIÓN</p>
            )}
          </div>
        ) : null}
      </section>
    </main>
  );
}
