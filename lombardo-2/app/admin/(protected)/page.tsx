import Link from "next/link";
import { AdminOrderRow } from "@/components/admin/AdminOrderRow";
import { loadAdminDashboard, loadVinrosHealth } from "@/lib/server/admin/admin-data";
import { formatAdminDate } from "@/lib/admin/presentation";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../admin.module.css";

export default async function AdminDashboardPage() {
  const [dashboard, vinros] = await Promise.all([loadAdminDashboard(), loadVinrosHealth()]);
  const metrics = [
    ["PEDIDOS HOY", String(dashboard.todayOrders), false],
    ["FACTURACIÓN HOY", formatCurrency(dashboard.todayRevenue), false],
    ["NUEVOS", String(dashboard.newOrders), dashboard.newOrders > 0],
    ["PREPARANDO", String(dashboard.preparingOrders), false],
    ["LISTOS", String(dashboard.readyOrders), dashboard.readyOrders > 0],
    ["PAGO PENDIENTE", String(dashboard.pendingPaymentOrders), dashboard.pendingPaymentOrders > 0],
  ] as const;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>HOY · OPERACIÓN</p>
          <h1>RESUMEN.</h1>
        </div>
        <p className={styles.liveIndicator}>ACTUALIZA CADA 30 SEGUNDOS</p>
      </header>

      <section className={styles.metricGrid} aria-label="Indicadores de hoy">
        {metrics.map(([label, value, alert]) => (
          <article className={styles.metricCard} data-alert={alert} key={label}>
            <span className={styles.metricLabel}>{label}</span>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>VINROS HEALTH</h2>
          <Link href="/admin/vinros">VER OPERACIÓN</Link>
        </div>
        <article className={styles.healthSummary} data-status={vinros.status}>
          <strong>{vinros.status === "ok" ? "OK" : vinros.status === "attention" ? "ATENCIÓN" : "BLOQUEADO"}</strong>
          <span>{vinros.total} productos · {vinros.safe} SAFE</span>
          <span>Última sincronización: {vinros.lastSyncAt ? formatAdminDate(vinros.lastSyncAt) : "sin datos"}</span>
        </article>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}>
          <h2>ÚLTIMOS PEDIDOS</h2>
          <Link href="/admin/pedidos">VER TODOS</Link>
        </div>
        {dashboard.recentOrders.length ? (
          <div className={styles.orderList}>
            {dashboard.recentOrders.map((order) => (
              <AdminOrderRow key={order.id} order={order} />
            ))}
          </div>
        ) : (
          <p className={styles.emptyState}>Todavía no hay pedidos.</p>
        )}
      </section>
    </>
  );
}
