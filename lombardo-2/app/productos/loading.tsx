import styles from "./CatalogState.module.css";

export default function ProductsLoading() {
  return (
    <main className={styles.state} aria-busy="true" aria-live="polite">
      <span>CATÁLOGO / CARGANDO</span>
      <div className={styles.pulse} aria-hidden="true" />
      <h1>BUSCANDO TODO LO BUENO.</h1>
      <p>Estamos trayendo la selección actualizada de Lombardo.</p>
    </main>
  );
}
