import styles from "./admin.module.css";

export default function AdminLoading() {
  return <div className={styles.loginRoot}><p className={styles.loadingText}>CARGANDO LOMBARDO ADMIN…</p></div>;
}
