"use client";

import styles from "./admin.module.css";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className={styles.loginRoot}>
      <section className={styles.loginCard}>
        <p className={styles.eyebrow}>NO PUDIMOS CONTINUAR</p>
        <h1>ADMIN NO DISPONIBLE.</h1>
        <p>Los datos no fueron modificados. Volvé a intentar en unos segundos.</p>
        <button className={styles.primaryButton} type="button" onClick={() => reset()}>REINTENTAR</button>
      </section>
    </div>
  );
}
