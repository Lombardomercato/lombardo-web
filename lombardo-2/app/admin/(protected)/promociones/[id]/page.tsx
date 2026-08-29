import Link from "next/link";
import { notFound } from "next/navigation";
import { PromotionAdminForm } from "@/components/admin/PromotionAdminForm";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { loadAdminPromotion } from "@/lib/server/admin/admin-data";
import styles from "../../../admin.module.css";
import { formatAdminDate } from "@/lib/admin/presentation";
import { formatCurrency } from "@/lib/utils/format-currency";

export default async function PromotionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  const [{ id }, feedback, session] = await Promise.all([params, searchParams, requireAdminSession()]);
  const promotion = await loadAdminPromotion(id);
  if (!promotion) notFound();
  return <><header className={styles.pageHeader}><div><p className={styles.eyebrow}>PROMOCIÓN</p><h1>{promotion.code}.</h1></div><Link href="/admin/promociones">← VOLVER</Link></header>{feedback.success ? <p className={styles.formSuccess}>{feedback.success}</p> : null}{feedback.error ? <p className={styles.formError}>{feedback.error}</p> : null}<section className={styles.metricGrid}><article className={styles.metricCard}><span>USOS CONSUMIDOS</span><strong>{promotion.consumedUses}</strong></article><article className={styles.metricCard}><span>RESERVAS ACTIVAS</span><strong>{promotion.reservedUses}</strong></article></section>{session.role === "admin" ? <PromotionAdminForm promotion={promotion} /> : <p className={styles.emptyState}>Sólo un administrador puede modificar esta promoción.</p>}<section className={styles.section}><div className={styles.sectionTitle}><h2>USOS Y RESERVAS</h2><span>{promotion.uses.length}</span></div>{promotion.uses.length ? <div className={styles.orderList}>{promotion.uses.map((usage) => <div className={styles.customerOrderRow} key={usage.id}><strong>ORDEN {usage.orderId}</strong><span>{usage.status}</span><span>{formatAdminDate(usage.consumedAt ?? usage.reservedAt)}</span><strong>−{formatCurrency(usage.discountAmount)}</strong></div>)}</div> : <p className={styles.emptyState}>Todavía no hay usos.</p>}</section></>;
}
