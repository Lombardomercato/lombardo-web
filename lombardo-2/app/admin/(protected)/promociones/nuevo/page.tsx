import Link from "next/link";
import { redirect } from "next/navigation";
import { PromotionAdminForm } from "@/components/admin/PromotionAdminForm";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import styles from "../../../admin.module.css";

export default async function NewPromotionPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [session, feedback] = await Promise.all([requireAdminSession(), searchParams]);
  if (session.role !== "admin") redirect("/admin/promociones");
  return <><header className={styles.pageHeader}><div><p className={styles.eyebrow}>NUEVO CUPÓN</p><h1>CREAR PROMOCIÓN.</h1></div><Link href="/admin/promociones">← VOLVER</Link></header>{feedback.error ? <p className={styles.formError}>{feedback.error}</p> : null}<PromotionAdminForm /></>;
}
