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
          <p className={styles.eyebrow}>PRODUCT IMAGE SYSTEM · PILOTO V1</p>
          <h1 className={styles.imageSystemTitle}>EL PRODUCTO CAMBIA.<br />EL SISTEMA NO.</h1>
        </div>
        <p>Masters intactos y una puesta Lombardo versionada. Este piloto no modifica todavía el catálogo público.</p>
      </header>
      <p className={styles.readOnlyNotice}>PILOTO · 4 VINOS/ESPUMANTES · 3 DESTILADOS · 2 GOURMET · 1 CERVEZA · 2 REGALOS/PACKS</p>
      {products.length === 12 ? (
        <ProductImageSystemPilot products={products} />
      ) : (
        <p className={styles.errorNotice}>El piloto está incompleto: {products.length} de 12 renders disponibles.</p>
      )}
    </>
  );
}
