import Link from "next/link";
import { ProductImageSystemPilot } from "@/components/admin/ProductImageSystemPilot";
import { loadProductImageSystemPilot } from "@/lib/server/admin/admin-data";
import styles from "../../../admin.module.css";

export default async function ProductImageSystemPilotPage() {
  const products = await loadProductImageSystemPilot();

  return (
    <>
      <Link className={styles.backLink} href="/admin/imagenes">← VOLVER A IMÁGENES</Link>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>PRODUCT IMAGE SYSTEM · V1 APROBADO</p>
          <h1 className={styles.imageSystemTitle}>EL PRODUCTO CAMBIA.<br />EL SISTEMA NO.</h1>
        </div>
        <p>Masters intactos y una puesta Lombardo versionada, activa para la cobertura del catálogo SAFE.</p>
      </header>
      <p className={styles.readOnlyNotice}>REFERENCIA APROBADA · 4 VINOS/ESPUMANTES · 3 DESTILADOS · 2 GOURMET · 1 CERVEZA · 2 REGALOS/PACKS</p>
      {products.length === 12 ? (
        <ProductImageSystemPilot products={products} />
      ) : (
        <p className={styles.errorNotice}>La referencia aprobada está incompleta: {products.length} de 12 renders disponibles.</p>
      )}
    </>
  );
}
