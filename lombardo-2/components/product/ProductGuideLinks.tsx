import Link from "next/link";
import { getGuide } from "@/lib/seo/guides";
import type { Product } from "@/types/commerce";
import styles from "./ProductGuideLinks.module.css";

export function ProductGuideLinks({ product }: { product: Product }) {
  if (product.category.slug !== "vinos") return null;
  const slugs = product.name.toLocaleLowerCase("es-AR").includes("malbec")
    ? ["malbec-7-botellas-para-entenderlo", "vino-para-asado-no-siempre-malbec"]
    : ["que-vino-llevar-a-una-cena", "regalar-vino-sin-saber-de-vino"];
  const guides = slugs.flatMap((slug) => {
    const guide = getGuide(slug);
    return guide ? [guide] : [];
  });

  return (
    <aside className={styles.section} aria-labelledby="product-guides-title">
      <div>
        <p>PARA ELEGIR MEJOR</p>
        <h2 id="product-guides-title">Ideas para esta botella.</h2>
      </div>
      <nav aria-label="Guías relacionadas con este producto">
        {guides.map((guide) => (
          <Link key={guide.slug} href={`/guias/${guide.slug}`}>
            <span>{guide.cluster}</span>
            <strong>{guide.cardTitle}</strong>
            <i aria-hidden="true">→</i>
          </Link>
        ))}
      </nav>
    </aside>
  );
}
