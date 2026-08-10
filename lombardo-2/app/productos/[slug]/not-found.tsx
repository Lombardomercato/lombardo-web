import Link from "next/link";
import styles from "./ProductDetailPage.module.css";

export default function ProductNotFound() {
  return (
    <main className={styles.notFound}>
      <span>404</span>
      <h1>ESO NO ESTÁ EN LA SELECCIÓN.</h1>
      <Link href="/productos">VOLVER AL CATÁLOGO →</Link>
    </main>
  );
}
