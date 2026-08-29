import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  deleteProductImageAction,
  moveProductImageAction,
  saveProductEditorialAction,
  setPrimaryProductImageAction,
} from "@/app/admin/actions";
import { ProductImageUpload } from "@/components/admin/ProductImageUpload";
import { ELIGIBILITY_LABELS, formatAdminDate } from "@/lib/admin/presentation";
import { RUNIA_CATALOG_CATEGORIES } from "@/lib/commerce/runia-catalog-mapper";
import { loadAdminProduct } from "@/lib/server/admin/admin-data";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../../admin.module.css";

type Query = Record<string, string | string[] | undefined>;

function queryText(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] : undefined;
}

export default async function AdminProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Query>;
}) {
  const product = await loadAdminProduct((await params).id);
  if (!product) notFound();
  const query = await searchParams;
  const success = queryText(query, "success");
  const error = queryText(query, "error");
  return (
    <>
      <Link className={styles.backLink} href="/admin/productos">← VOLVER A PRODUCTOS</Link>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>{product.sku} · {product.supplierName}</p><h1>{product.name}</h1></div>
        <span className={styles.eligibility} data-eligibility={product.eligibilityStatus}>{ELIGIBILITY_LABELS[product.eligibilityStatus]}</span>
      </header>
      {success ? <p className={styles.notice}>{success}</p> : null}
      {error ? <p className={styles.errorNotice}>{error}</p> : null}

      <section className={styles.productDetailGrid}>
        <article className={styles.detailCard}>
          <p className={styles.sourceLabel}>FUENTE DE VERDAD · VINROS · SOLO LECTURA</p>
          <h2>DATOS DEL PROVEEDOR</h2>
          <div className={styles.detailFields}>
            <div className={styles.detailField}><span className={styles.fieldLabel}>SKU</span><p>{product.sku}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>NOMBRE</span><p>{product.rawName}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>MARCA DETECTADA</span><p>{product.brand}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>CATEGORÍA</span><p>{product.category}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>PRESENTACIÓN</span><p>{product.rawPresentation}</p></div>
            <div className={styles.detailField}><span className={styles.fieldLabel}>ÚLTIMA PRESENCIA</span><p>{product.lastSeen ? formatAdminDate(product.lastSeen) : "—"}</p></div>
          </div>
          <div className={styles.priceGrid}>{product.prices.map((price) => <span key={price.type}><small>{price.type.toLocaleUpperCase("es-AR")}</small><strong>{price.value === null ? "—" : formatCurrency(price.value)}</strong><em>{price.origin === "current" ? "VIGENTE" : price.origin === "candidate" ? "CANDIDATO · NO PUBLICADO" : "SIN DATO"}</em></span>)}</div>
          <p className={styles.readOnlyNotice}>Estos precios se actualizan únicamente por VINROS. Los datos editoriales y las imágenes no pueden cambiar eligibility ni publicación.</p>
        </article>

        <article className={styles.detailCard}>
          <p className={styles.sourceLabel}>LOMBARDO · CAPA EDITORIAL</p>
          <h2>DATOS EDITORIALES</h2>
          <form className={styles.editorialForm} action={saveProductEditorialAction}>
            <input type="hidden" name="productId" value={product.id} />
            <label>NOMBRE PÚBLICO (OPCIONAL)<input name="nameOverride" maxLength={240} defaultValue={product.editorial.nameOverride} /></label>
            <label>MARCA<input name="brandName" maxLength={120} defaultValue={product.editorial.brandName} /></label>
            <label>CATEGORÍA<select name="categorySlug" defaultValue={product.editorial.categorySlug || product.categorySlug}><option value="">HEREDAR DE VINROS</option>{RUNIA_CATALOG_CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.name.toLocaleUpperCase("es-AR")}</option>)}</select></label>
            <label>DESCRIPCIÓN<textarea name="description" maxLength={4000} rows={5} defaultValue={product.editorial.description} /></label>
            <label>TAGS · SEPARADOS POR COMA<input name="tags" maxLength={1200} defaultValue={product.editorial.tags.join(", ")} /></label>
            <label>NOTAS INTERNAS<textarea name="internalNotes" maxLength={4000} rows={3} defaultValue={product.editorial.internalNotes} /></label>
            <label>ESTADO EDITORIAL<select name="editorialStatus" defaultValue={product.editorial.status}><option value="draft">BORRADOR</option><option value="approved">APROBADO</option></select></label>
            <button className={styles.primaryButton} type="submit">GUARDAR EDITORIAL</button>
          </form>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>IMÁGENES</h2><span>{product.media.length} EN GALERÍA</span></div>
        <ProductImageUpload productId={product.id} hasImages={product.media.length > 0} />
        {product.media.length ? <div className={styles.mediaGrid}>{product.media.map((media, index) => <article className={styles.mediaCard} key={media.id}>
          <div className={styles.mediaPreview}><Image src={media.url} alt={media.alt} fill sizes="(max-width: 700px) 100vw, 22vw" /></div>
          <div><strong>{media.isPrimary ? "PRINCIPAL" : `GALERÍA ${index + 1}`}</strong><p>{media.alt}</p><small>{media.source.replaceAll("_", " ").toLocaleUpperCase("es-AR")} · {(media.byteSize / 1024).toFixed(0)} KB</small>{media.sourceUrl ? <a href={media.sourceUrl} target="_blank" rel="noreferrer">VER FUENTE</a> : null}</div>
          <div className={styles.mediaActions}>
            {!media.isPrimary ? <form action={setPrimaryProductImageAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="mediaId" value={media.id} /><button className={styles.secondaryButton}>HACER PRINCIPAL</button></form> : null}
            <form action={moveProductImageAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="mediaId" value={media.id} /><button className={styles.secondaryButton} name="direction" value="up" disabled={index === 0}>←</button><button className={styles.secondaryButton} name="direction" value="down" disabled={index === product.media.length - 1}>→</button></form>
            <form action={deleteProductImageAction}><input type="hidden" name="productId" value={product.id} /><input type="hidden" name="mediaId" value={media.id} /><button className={styles.dangerButton}>ELIMINAR</button></form>
          </div>
        </article>)}</div> : <p className={styles.emptyState}>Sin imagen aprobada. La tienda mantiene el sistema gráfico editorial actual.</p>}
      </section>

      {product.anomalies.length ? <section className={styles.section}><div className={styles.sectionTitle}><h2>ANOMALÍAS VINROS</h2></div><ul className={styles.anomalyList}>{product.anomalies.map((anomaly) => <li key={anomaly.id}><strong>{anomaly.type}</strong> · {anomaly.message}</li>)}</ul></section> : null}
    </>
  );
}
