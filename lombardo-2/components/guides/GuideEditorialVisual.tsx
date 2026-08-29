import { ProductVisual } from "@/components/product/ProductVisual";
import type { Product } from "@/types/commerce";
import styles from "./GuideEditorialVisual.module.css";

export function GuideHeroVisual({ products }: { products: Product[] }) {
  return (
    <div className={styles.heroVisual} aria-label="Selección de botellas de la nota">
      {products.slice(0, 3).map((product, index) => (
        <div className={styles.heroBottle} data-index={index} key={product.id}>
          <ProductVisual product={product} priority={index === 0} />
        </div>
      ))}
      <span aria-hidden="true">PARA<br />ELEGIR<br />MEJOR.</span>
    </div>
  );
}

export function GuideVisualMoment({
  products,
  caption,
  index,
}: {
  products: Product[];
  caption: string;
  index: number;
}) {
  return (
    <figure className={styles.moment} data-reverse={index % 2 === 1}>
      <div className={styles.momentVisuals}>
        {products.slice(0, 2).map((product, productIndex) => (
          <div key={product.id} data-index={productIndex}>
            <ProductVisual product={product} />
          </div>
        ))}
      </div>
      <figcaption>
        <span>{String(index + 1).padStart(2, "0")} / NOTA DE MESA</span>
        <p>{caption}</p>
      </figcaption>
    </figure>
  );
}
