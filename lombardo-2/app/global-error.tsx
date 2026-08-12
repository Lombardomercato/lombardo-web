"use client";

import styles from "./productos/CatalogState.module.css";
import "./globals.css";

export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="es-AR">
      <body>
        <main className={styles.state} role="alert">
          <span>LOMBARDO / PAUSA</span>
          <h1>ALGO NO SALIÓ COMO ESPERÁBAMOS.</h1>
          <p>No se perdió ninguna compra. Probá nuevamente en un momento.</p>
          <button type="button" onClick={reset}>
            REINTENTAR →
          </button>
        </main>
      </body>
    </html>
  );
}
