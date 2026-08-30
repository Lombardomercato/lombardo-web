import {
  pinHomeFeaturedAction,
  runAutomationAction,
  unpinHomeFeaturedAction,
} from "@/app/admin/actions";
import { formatAdminDate } from "@/lib/admin/presentation";
import { loadAutomationDashboard } from "@/lib/server/automations/dashboard";
import styles from "../../admin.module.css";
import localStyles from "./AutomationDashboard.module.css";

interface PageProps {
  searchParams: Promise<{ success?: string; error?: string }>;
}

export default async function AutomationDashboardPage({ searchParams }: PageProps) {
  const [dashboard, feedback] = await Promise.all([loadAutomationDashboard(), searchParams]);
  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>RUNIA · OPERACIÓN DIARIA</p>
          <h1>AUTOMATIZACIONES.</h1>
        </div>
        <p>Una corrida diaria · 00:05 ART · con locks, fallback y auditoría.</p>
      </header>

      {feedback.success ? <p className={localStyles.success} role="status">{feedback.success}</p> : null}
      {feedback.error ? <p className={localStyles.error} role="alert">{feedback.error}</p> : null}

      <section className={localStyles.runGrid} aria-label="Estado de automatizaciones">
        {dashboard.rows.map((row) => (
          <article className={localStyles.runCard} data-status={row.status} key={row.type}>
            <div>
              <span>{row.label}</span>
              <strong>{row.status === "never" ? "SIN EJECUTAR" : row.status.toLocaleUpperCase("es-AR")}</strong>
            </div>
            <dl>
              <div><dt>ÚLTIMA</dt><dd>{row.lastRunAt ? formatAdminDate(row.lastRunAt) : "Sin datos"}</dd></div>
              <div><dt>PRÓXIMA</dt><dd>{formatAdminDate(row.nextRunAt)}</dd></div>
            </dl>
            <p>{row.result}</p>
            {row.errors.map((error) => <small key={error}>{error}</small>)}
            <form action={runAutomationAction}>
              <input type="hidden" name="automationType" value={row.type} />
              <button type="submit">{row.type === "vinros" ? "AUDITAR AHORA" : "EJECUTAR AHORA"}</button>
            </form>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>PIN MANUAL · HOME</h2>
          <span>{dashboard.pins.length}/6</span>
        </div>
        <p className={localStyles.help}>Sólo acepta SKU SAFE. El PIN ocupa una posición sin desactivar la diversidad del resto.</p>
        <form action={pinHomeFeaturedAction} className={localStyles.pinForm}>
          <label><span>SKU SAFE</span><input name="sku" required maxLength={80} /></label>
          <label><span>POSICIÓN 1–6</span><input name="position" type="number" min={1} max={6} defaultValue={1} /></label>
          <button type="submit">FIJAR PRODUCTO</button>
        </form>
        {dashboard.pins.length ? (
          <div className={localStyles.pinList}>
            {dashboard.pins.map((pin) => (
              <article key={pin.id}>
                <span>{pin.sku} · POSICIÓN {pin.position + 1}</span>
                <strong>{pin.name}</strong>
                <form action={unpinHomeFeaturedAction}>
                  <input type="hidden" name="pinId" value={pin.id} />
                  <button type="submit">QUITAR PIN</button>
                </form>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>No hay productos fijados. La selección rota automáticamente.</p>}
      </section>
    </>
  );
}
