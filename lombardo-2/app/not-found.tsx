import Link from "next/link";
import styles from "./productos/CatalogState.module.css";

export default function NotFound() {
  return (
    <main className={styles.state}>
      <span>404</span>
      <h1>ESA PÁGINA NO ESTÁ ACÁ.</h1>
      <p>Podés volver a la selección completa de Lombardo.</p>
      <Link href="/productos">VOLVER AL CATÁLOGO →</Link>
    </main>
  );
}
