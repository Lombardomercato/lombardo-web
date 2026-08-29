"use client";

import Link from "next/link";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import { canAddToCart, getAddLabel } from "@/lib/commerce/availability";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { Category, Product } from "@/types/commerce";
import styles from "./CommercialDiscovery.module.css";

const categoryCopy: Record<string, string> = {
  vinos: "Tintos, blancos, espumosos y esa botella que resuelve la mesa.",
  destilados: "Para el bar, para compartir o para regalar distinto.",
  gourmet: "Algo rico que convierte un detalle en un buen regalo.",
  regalos: "Accesorios y presentaciones para entregar sin vueltas.",
};

const categoryTone: Record<string, string> = {
  vinos: styles.wine,
  destilados: styles.spirits,
  gourmet: styles.gourmet,
  regalos: styles.gifts,
};

interface CommercialDiscoveryProps {
  categories: Category[];
  products: Product[];
  catalogTotal: number | null;
}

function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addItem } = useCart();
  const addable = canAddToCart(product.availability);

  return (
    <article className={styles.productCard}>
      <Link
        className={styles.productVisual}
        href={`/productos/${product.slug}`}
        aria-label={`Ver ${product.name}`}
      >
        <ProductVisual product={product} priority={index < 2} />
      </Link>
      <div className={styles.productDetails}>
        <p>{product.brand.name} · {product.presentation}</p>
        <h3>
          <Link href={`/productos/${product.slug}`}>{product.name}</Link>
        </h3>
        <div>
          <strong>{formatCurrency(product.price)}</strong>
          <button
            type="button"
            disabled={!addable}
            onClick={() => addItem(product)}
            aria-label={`${getAddLabel(product.availability)}: ${product.name}`}
          >
            {getAddLabel(product.availability)} <span aria-hidden="true">＋</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function CommercialDiscovery({
  categories,
  products,
  catalogTotal,
}: CommercialDiscoveryProps) {
  const featuredCategories = categories.filter((category) =>
    category.slug in categoryCopy,
  );

  return (
    <div className={styles.discovery}>
      <section
        id="experiencias"
        className={styles.categories}
        aria-labelledby="categories-title"
      >
        <header className={styles.sectionHeader}>
          <p>ENTRÁ POR ACÁ / 02</p>
          <h2 id="categories-title">ENCONTRÁ ALGO BUENO.</h2>
          <Link href="/productos">Ver todo el catálogo →</Link>
        </header>

        <div className={styles.categoryGrid}>
          {featuredCategories.map((category, index) => (
            <Link
              key={category.id}
              className={`${styles.categoryCard} ${categoryTone[category.slug] ?? ""}`}
              href={`/categorias/${category.slug}`}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{category.name}</h3>
              <p>{categoryCopy[category.slug]}</p>
              <strong aria-hidden="true">↗</strong>
            </Link>
          ))}
        </div>
      </section>

      <section className={styles.products} aria-labelledby="products-title">
        <header className={styles.productHeader}>
          <div>
            <p>PARA ARRANCAR / 03</p>
            <h2 id="products-title">ALGUNAS BUENAS IDEAS.</h2>
          </div>
          <p>
            Productos reales de nuestra selección. Elegí uno o seguí explorando.
          </p>
        </header>

        {products.length ? (
          <div className={styles.productGrid}>
            {products.map((product, index) => (
              <ProductCard key={product.id} product={product} index={index} />
            ))}
          </div>
        ) : (
          <div className={styles.productsUnavailable}>
            <p>La selección se está actualizando.</p>
            <Link href="/productos">Entrar al catálogo →</Link>
          </div>
        )}

        <Link className={styles.catalogAction} href="/productos">
          {catalogTotal
            ? `Ver los ${catalogTotal.toLocaleString("es-AR")} productos`
            : "Ver todo el catálogo"}{" "}
          <span aria-hidden="true">→</span>
        </Link>
      </section>

      <section id="empresas" className={styles.business}>
        <p>REGALOS PARA EQUIPOS Y CLIENTES</p>
        <h2>CUANDO HAY QUE QUEDAR BIEN CON VARIOS.</h2>
        <p>
          Armamos opciones para empresas, fechas especiales y entregas en Rosario.
        </p>
        <Link href="#contacto">Hablemos →</Link>
      </section>
    </div>
  );
}
