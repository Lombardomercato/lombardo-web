import Link from "next/link";
import { notFound } from "next/navigation";
import { ELIGIBILITY_LABELS, formatAdminDate } from "@/lib/admin/presentation";
import { loadVinrosReviewProducts } from "@/lib/server/admin/admin-data";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../../admin.module.css";

export default async function VinrosReviewPage({ params }: { params: Promise<{ status: string }> }) {
  const status = (await params).status;
  if (status !== "blocked" && status !== "pending_review") notFound();
  const products = await loadVinrosReviewProducts(status);
  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>VINROS · REVISIÓN SOLO LECTURA</p><h1>{ELIGIBILITY_LABELS[status]}.</h1></div>
        <p>{products.length} productos. Los precios VINROS no se pueden editar desde Lombardo.</p>
      </header>
      <div className={styles.reviewProductList}>
        {products.map((product) => <article className={styles.reviewProduct} key={product.id}>
          <header><div><strong>{product.sku}</strong><h2>{product.rawName}</h2><span>{product.rawPresentation}</span></div><Link className={styles.secondaryButton} href={`/admin/productos/${product.id}`}>VER FICHA</Link></header>
          <p className={styles.reviewReason}>{product.reviewReason}</p>
          <div className={styles.priceGrid}>{product.prices.map((price) => <span key={price.type}><small>{price.type.toLocaleUpperCase("es-AR")}</small><strong>{price.value === null ? "—" : formatCurrency(price.value)}</strong><em>{price.origin === "candidate" ? "CANDIDATO · NO PUBLICADO" : price.origin === "current" ? "VIGENTE" : "SIN DATO"}</em></span>)}</div>
          {product.anomalies.length ? <ul className={styles.anomalyList}>{product.anomalies.map((anomaly) => <li key={anomaly.id}><strong>{anomaly.type}</strong> · {anomaly.message} · {formatAdminDate(anomaly.lastDetectedAt)}</li>)}</ul> : null}
        </article>)}
      </div>
    </>
  );
}
