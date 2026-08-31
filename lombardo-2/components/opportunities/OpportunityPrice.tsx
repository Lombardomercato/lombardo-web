import { formatCurrency } from "@/lib/utils/format-currency";
import type { Product } from "@/types/commerce";
import styles from "./OpportunityPrice.module.css";

export function OpportunityPrice({ product, size = "card" }: {
  product: Product;
  size?: "card" | "detail";
}) {
  const referencePrice = product.opportunity?.referencePrice;
  const isOpportunity = referencePrice !== undefined && product.price < referencePrice;

  return (
    <div className={styles.price} data-size={size}>
      {isOpportunity ? (
        <>
          <span className={styles.badge}>OPORTUNIDAD</span>
          <del aria-label={`Precio anterior ${formatCurrency(referencePrice)}`}>
            {formatCurrency(referencePrice)}
          </del>
        </>
      ) : product.compareAtPrice ? (
        <del>{formatCurrency(product.compareAtPrice)}</del>
      ) : null}
      <strong>{formatCurrency(product.price)}</strong>
    </div>
  );
}
