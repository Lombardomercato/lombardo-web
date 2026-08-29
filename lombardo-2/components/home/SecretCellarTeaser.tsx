import Link from "next/link";
import styles from "./SecretCellarTeaser.module.css";

export function SecretCellarTeaser() {
  return (
    <section className={styles.teaser} aria-labelledby="secret-cellar-title">
      <div className={styles.arch} aria-hidden="true"><span /></div>
      <div className={styles.copy}>
        <p>UNA BOTELLA · UNA VEZ POR DÍA</p>
        <h2 id="secret-cellar-title">CAVA<br /><em>SECRETA.</em></h2>
        <p>La botella de hoy ya está escondida.</p>
        <Link href="/cava-secreta">ENTRAR <span aria-hidden="true">→</span></Link>
      </div>
      <span className={styles.mark} aria-hidden="true">?</span>
    </section>
  );
}
