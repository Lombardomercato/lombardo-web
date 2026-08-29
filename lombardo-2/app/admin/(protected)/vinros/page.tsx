import Link from "next/link";
import { formatAdminDate } from "@/lib/admin/presentation";
import { loadVinrosHealth } from "@/lib/server/admin/admin-data";
import styles from "../../admin.module.css";

export default async function VinrosHealthPage() {
  const health = await loadVinrosHealth();
  const metrics = [
    ["TOTAL", health.total],
    ["SAFE", health.safe],
    ["BLOCKED", health.blocked],
    ["PENDING REVIEW", health.pendingReview],
    ["SOLO COSTO", health.supplierOnlyCost],
  ] as const;
  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>CATÁLOGO · AUTOMATIZACIÓN VINROS</p><h1>VINROS HEALTH.</h1></div>
        <span className={styles.healthBadge} data-status={health.status}>{health.status === "ok" ? "OK" : health.status === "attention" ? "ATENCIÓN" : "BLOQUEADO"}</span>
      </header>
      <section className={styles.healthTimeline}>
        <span><strong>ÚLTIMA SINCRONIZACIÓN</strong>{health.lastSyncAt ? formatAdminDate(health.lastSyncAt) : "Sin datos"}</span>
        <span><strong>PRÓXIMA SINCRONIZACIÓN</strong>{formatAdminDate(health.nextSyncAt)}</span>
        <span><strong>ÚLTIMO WRITE</strong>{health.lastWriteAt ? formatAdminDate(health.lastWriteAt) : "Sin datos"}</span>
        <span><strong>PRECIOS ACTUALIZADOS</strong>{health.pricesUpdated}</span>
      </section>
      <section className={styles.metricGrid} aria-label="Estado del catálogo VINROS">
        {metrics.map(([label, metric]) => <article className={styles.metricCard} key={label}><span className={styles.metricLabel}>{label}</span><strong>{metric}</strong></article>)}
      </section>
      <section className={styles.reviewLinks}>
        <Link href="/admin/vinros/blocked"><strong>{health.blocked}</strong><span>REVISAR BLOCKED</span></Link>
        <Link href="/admin/vinros/pending_review"><strong>{health.pendingReview}</strong><span>REVISAR PENDING</span></Link>
      </section>
      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>ALERTAS RECIENTES</h2></div>
        {health.alerts.length ? <div className={styles.alertList}>{health.alerts.map((alert, index) => <article key={`${alert.at}-${index}`} data-severity={alert.severity}><strong>{alert.severity.toLocaleUpperCase("es-AR")}</strong><p>{alert.message}</p><small>{formatAdminDate(alert.at)}</small></article>)}</div> : <p className={styles.emptyState}>No hay alertas abiertas.</p>}
      </section>
    </>
  );
}
