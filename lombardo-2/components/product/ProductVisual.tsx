import Image from "next/image";
import type { Product } from "@/types/commerce";
import styles from "./ProductVisual.module.css";

type ProductVisualVariant = "editorial" | "list" | "detail" | "cart";

interface ProductVisualProps {
  product: Product;
  variant?: ProductVisualVariant;
  priority?: boolean;
}

const categoryCodes: Record<string, string> = {
  vinos: "VIN",
  destilados: "DES",
  cervezas: "CER",
  regalos: "REG",
  gourmet: "GOU",
  "sin-alcohol": "S/A",
};

const categoryTones: Record<string, string> = {
  vinos: styles.toneWine,
  destilados: styles.toneWine,
  cervezas: styles.toneGift,
  regalos: styles.toneGift,
  gourmet: styles.toneGourmet,
  "sin-alcohol": styles.toneSoft,
};

const imageSizes: Record<ProductVisualVariant, string> = {
  editorial: "(max-width: 768px) 92vw, (max-width: 1200px) 50vw, 38vw",
  list: "(max-width: 768px) 5.5rem, 11rem",
  detail: "(max-width: 768px) 100vw, 52vw",
  cart: "6rem",
};

export function ProductVisual({
  product,
  variant = "editorial",
  priority = false,
}: ProductVisualProps) {
  const image = product.images[0];
  const variantClass = styles[variant];
  const isNormalizedRender = image?.src.includes("/renders/product-image-system-v1/") ?? false;

  if (image) {
    return (
      <div className={`${styles.visual} ${styles.photo} ${isNormalizedRender ? styles.normalized : ""} ${variantClass}`}>
        <Image
          src={image.src}
          alt={image.alt}
          fill
          priority={priority}
          sizes={imageSizes[variant]}
          unoptimized={isNormalizedRender}
        />
        <span className={styles.photoCategory}>{product.category.name}</span>
      </div>
    );
  }

  const tone = categoryTones[product.category.slug] ?? styles.toneWine;

  return (
    <div
      className={`${styles.visual} ${styles.graphic} ${tone} ${variantClass}`}
      role="img"
      aria-label={`${product.name}, representación gráfica Lombardo`}
    >
      <span className={styles.brand}>{product.brand.name}</span>
      <span className={styles.code} aria-hidden="true">
        {categoryCodes[product.category.slug] ?? "LOM"}
      </span>
      <strong>{product.name}</strong>
      <span className={styles.presentation}>{product.presentation}</span>
      <span className={styles.number} aria-hidden="true">
        {product.sku.slice(-3)}
      </span>
    </div>
  );
}
