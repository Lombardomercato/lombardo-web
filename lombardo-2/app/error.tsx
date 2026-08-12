"use client";

import styles from "./productos/CatalogState.module.css";

export default function AppError({ reset }: { reset: () => void }) {
  return (
    <main className={styles.state} role="alert">
      <span>LOMBARDO / PAUSA</span>
      <h1>NO PUDIMOS COMPLETAR ESA ACCIÓN.</h1>
      <p>Tu navegación sigue disponible. Probá nuevamente en un momento.</p>
      <button type="button" onClick={reset}>
        REINTENTAR →
      </button>
    </main>
  );
}
