"use client";

import styles from "./CatalogState.module.css";

export default function ProductsError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.state} role="alert">
      <span>CATÁLOGO / PAUSA</span>
      <h1>NO PUDIMOS TRAER LA SELECCIÓN.</h1>
      <p>Tu navegación sigue intacta. Probá nuevamente en un momento.</p>
      <button type="button" onClick={reset}>
        REINTENTAR →
      </button>
    </main>
  );
}
