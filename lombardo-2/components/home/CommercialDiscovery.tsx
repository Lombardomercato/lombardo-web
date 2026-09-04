"use client";

import Image from "next/image";
import Link from "next/link";
import type { Category } from "@/types/commerce";
import styles from "./CommercialDiscovery.module.css";

const categoryCopy: Record<string, string> = {
  vinos: "Tintos, blancos, espumosos y esa botella que resuelve la mesa.",
  destilados: "Para el bar, para compartir o para regalar distinto.",
  gourmet: "Algo rico que convierte un detalle en un buen regalo.",
  cervezas: "Opciones para compartir, descubrir y tener siempre a mano.",
};

const categoryTone: Record<string, string> = {
  vinos: styles.wine,
  destilados: styles.spirits,
  gourmet: styles.gourmet,
  cervezas: styles.gifts,
};

const categoryArtwork: Record<string, string> = {
  vinos: "/images/editorial/categories/vinos-v1.jpg",
  destilados: "/images/editorial/categories/destilados-v1.jpg",
  gourmet: "/images/editorial/categories/gourmet-v1.jpg",
};

interface CommercialDiscoveryProps {
  categories: Category[];
  catalogTotal: number | null;
}

function CategoryEditorial({ categorySlug }: { categorySlug: string }) {
  const artwork = categoryArtwork[categorySlug];
  if (!artwork) return null;

  return (
    <span className={styles.categoryArt} aria-hidden="true">
      <Image
        src={artwork}
        alt=""
        fill
        sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 25vw"
      />
    </span>
  );
}

export function CommercialDiscovery({
  categories,
  catalogTotal,
}: CommercialDiscoveryProps) {
  const featuredCategories = categories.filter((category) =>
    category.slug in categoryCopy,
  );

  return (
    <div className={styles.discovery}>
      <section
        id="categorias"
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
              <span className={styles.categoryIndex}>
                {String(index + 1).padStart(2, "0")}
              </span>
              <CategoryEditorial categorySlug={category.slug} />
              <h3>{category.name}</h3>
              <p>{categoryCopy[category.slug]}</p>
              <strong aria-hidden="true">↗</strong>
            </Link>
          ))}
        </div>
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
        <Link href="/empresas">VER OPCIONES PARA EMPRESAS →</Link>
      </section>
    </div>
  );
}
