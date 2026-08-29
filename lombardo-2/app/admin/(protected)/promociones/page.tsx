import Link from "next/link";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { loadAdminPromotions } from "@/lib/server/admin/admin-data";
import { formatAdminDate } from "@/lib/admin/presentation";
import type { AdminPromotion } from "@/lib/server/admin/types";
import styles from "../../admin.module.css";

function displayStatus(promotion: AdminPromotion) {
  if (promotion.status === "INACTIVE") return "DESACTIVADA";
  const now = Date.now();
  if (promotion.startAt && new Date(promotion.startAt).getTime() > now) return "PROGRAMADA";
  if (promotion.endAt && new Date(promotion.endAt).getTime() <= now) return "VENCIDA";
  if (promotion.maxTotalUses !== undefined && promotion.consumedUses + promotion.reservedUses >= promotion.maxTotalUses) return "AGOTADA";
  return "ACTIVA";
}

export default async function AdminPromotionsPage() {
  const [promotions, session] = await Promise.all([loadAdminPromotions(), requireAdminSession()]);
  return <>
    <header className={styles.pageHeader}><div><p className={styles.eyebrow}>CUPONES Y CAMPAÑAS</p><h1>PROMOCIONES.</h1></div><div className={styles.headerActions}><p>{promotions.length} promociones configuradas.</p>{session.role === "admin" ? <Link className={styles.primaryLink} href="/admin/promociones/nuevo">CREAR PROMOCIÓN →</Link> : null}</div></header>
    {promotions.length ? <div className={styles.customerList}>{promotions.map((promotion) => <Link className={styles.promotionRow} href={`/admin/promociones/${promotion.id}`} key={promotion.id}><span><strong>{promotion.code}</strong><small>{promotion.name}</small></span><strong>{promotion.discountType === "PERCENTAGE" ? `${promotion.discountValue}%` : `$ ${promotion.discountValue}`}</strong><span className={styles.statusBadge} data-status={displayStatus(promotion).toLocaleLowerCase("en-US")}>{displayStatus(promotion)}</span><span>{promotion.consumedUses} usados<small>{promotion.reservedUses} reservados</small></span><span>{formatAdminDate(promotion.updatedAt)}</span></Link>)}</div> : <div className={styles.emptyState}><p>Todavía no hay promociones.</p></div>}
  </>;
}
