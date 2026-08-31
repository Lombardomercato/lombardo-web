import { AiAuditStore } from "@/lib/server/ai/audit-store";
import { readAiSalesConfiguration } from "@/lib/server/ai/config";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";

export default async function AssistantAdminPage() {
  const configuration = readAiSalesConfiguration();
  const pricing = await getCurrentCustomerPricingContext();
  const audit = new AiAuditStore({
    url: configuration.runia.url,
    secretKey: configuration.runia.secretKey,
  });
  if (!pricing.tenantRecordId) throw new Error("AI_TENANT_CONTEXT_MISSING");
  const dashboard = await audit.dashboard(pricing.tenantRecordId, 14);
  const metrics = [
    ["CONVERSACIONES", dashboard.sessions],
    ["MENSAJES", dashboard.messages],
    ["RECOMENDACIONES", dashboard.recommendations],
    ["CLICKS", dashboard.clicks],
    ["AGREGADOS", dashboard.adds],
    ["ERRORES", dashboard.errors],
  ] as const;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>BETA · ÚLTIMOS 14 DÍAS</p>
          <h1>ASISTENTE.</h1>
        </div>
        <p>Observabilidad operativa sin guardar el texto libre de las conversaciones.</p>
      </header>

      <section className={styles.metricGrid} aria-label="Métricas del asistente">
        {metrics.map(([label, value]) => (
          <article className={styles.metricCard} data-alert={label === "ERRORES" && value > 0} key={label}>
            <span className={styles.metricLabel}>{label}</span>
            <strong>{value.toLocaleString("es-AR")}</strong>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>CONVERSIÓN ASISTIDA</h2>
          <span>VENTANA 14 DÍAS</span>
        </div>
        <div className={styles.metricGrid}>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>CLICK / RECOMENDACIÓN</span>
            <strong>{dashboard.clickRate}%</strong>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>AGREGADO / RECOMENDACIÓN</span>
            <strong>{dashboard.addRate}%</strong>
          </article>
          <article className={styles.metricCard}>
            <span className={styles.metricLabel}>TOOLS EJECUTADAS</span>
            <strong>{dashboard.toolCalls.toLocaleString("es-AR")}</strong>
          </article>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>TOOLS MÁS USADAS</h2></div>
        {dashboard.topTools.length ? (
          <div className={styles.productList}>
            {dashboard.topTools.map(([name, count]) => (
              <article className={styles.metricCard} key={name}>
                <span className={styles.metricLabel}>{name}</span>
                <strong>{count.toLocaleString("es-AR")}</strong>
              </article>
            ))}
          </div>
        ) : <p className={styles.emptyState}>Todavía no hay uso productivo del asistente.</p>}
      </section>
    </>
  );
}
