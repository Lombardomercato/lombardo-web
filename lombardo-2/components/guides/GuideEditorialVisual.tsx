import Image from "next/image";
import { ProductVisual } from "@/components/product/ProductVisual";
import type { Product } from "@/types/commerce";
import styles from "./GuideEditorialVisual.module.css";

interface EditorialVisualProps {
  image?: string;
  alt?: string;
  caption?: string;
  products?: Product[];
}

export function GuideHeroVisual({ image, alt = "", caption = "", products = [] }: EditorialVisualProps) {
  if (image) {
    return (
      <figure className={styles.heroPhoto}>
        <div>
          <Image src={image} alt={alt} fill priority sizes="100vw" style={{ objectFit: "cover" }} />
        </div>
        <figcaption>
          <span>FOTOGRAFÍA EDITORIAL · LOMBARDO.</span>
          <p>{caption}</p>
        </figcaption>
      </figure>
    );
  }

  return (
    <figure className={styles.fallbackHero}>
      <div aria-label="Selección de botellas de la nota">
        {products.slice(0, 3).map((product, index) => (
          <div className={styles.heroBottle} data-index={index} key={product.id}>
            <ProductVisual product={product} priority={index === 0} />
          </div>
        ))}
      </div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

export function GuideVisualMoment({
  image,
  alt = "",
  products = [],
  caption = "",
  index,
}: EditorialVisualProps & { index: number }) {
  return (
    <figure className={styles.moment} data-reverse={index % 2 === 1}>
      <div className={styles.momentVisual}>
        {image ? (
          <Image
            src={image}
            alt={alt}
            fill
            sizes="(max-width: 768px) 100vw, 82vw"
            style={{ objectFit: "cover", objectPosition: index % 2 ? "72% center" : "28% center" }}
          />
        ) : (
          <div className={styles.fallbackProducts}>
            {products.slice(0, 2).map((product) => <ProductVisual product={product} key={product.id} />)}
          </div>
        )}
      </div>
      <figcaption>
        <span>{String(index + 1).padStart(2, "0")} / APUNTE VISUAL</span>
        <p>{caption}</p>
      </figcaption>
    </figure>
  );
}
