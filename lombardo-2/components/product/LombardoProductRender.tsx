import Image from "next/image";
import styles from "./LombardoProductRender.module.css";

export type LombardoImageVariant = "wine" | "spirits" | "beer" | "gourmet" | "gifts";

interface LombardoProductRenderProps {
  src: string;
  alt: string;
  name: string;
  sku: string;
  presentation: string;
  variant: LombardoImageVariant;
  priority?: boolean;
  showMaster?: boolean;
}

const variantLabels: Record<LombardoImageVariant, string> = {
  wine: "VINOS / ESPUMANTES",
  spirits: "DESTILADOS",
  beer: "CERVEZAS",
  gourmet: "GOURMET",
  gifts: "REGALOS / PACKS",
};

export function LombardoProductRender({
  src,
  alt,
  name,
  sku,
  presentation,
  variant,
  priority = false,
  showMaster = false,
}: LombardoProductRenderProps) {
  if (showMaster) {
    return (
      <div className={styles.master}>
        <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 700px) 92vw, 25vw" />
        <span>SOURCE MASTER · SIN INTERVENCIÓN</span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.render} ${styles[variant]}`}
      role="img"
      aria-label={`${name}, presentación visual Lombardo`}
    >
      <span className={styles.category}>{variantLabels[variant]}</span>
      <span className={styles.monogram} aria-hidden="true">L</span>
      <span className={styles.orbit} aria-hidden="true" />
      <span className={styles.horizon} aria-hidden="true" />
      <div className={styles.product}>
        <Image src={src} alt={alt} fill priority={priority} sizes="(max-width: 700px) 92vw, 25vw" />
      </div>
      <span className={styles.sku}>{sku}</span>
      <span className={styles.presentation}>{presentation}</span>
    </div>
  );
}
