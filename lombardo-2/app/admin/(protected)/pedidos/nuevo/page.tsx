import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminOrderForm } from "@/components/admin/AdminOrderForm";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";

import styles from "../../../admin.module.css";

export default async function NewAdminOrderPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [session, feedback] = await Promise.all([
    requireAdminSession(),
    searchParams,
  ]);
  if (session.role !== "admin") redirect("/admin/pedidos");
  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>GESTIÓN</p><h1>NUEVO PEDIDO.</h1></div>
        <Link className={styles.secondaryButton} href="/admin/pedidos">VOLVER A PEDIDOS</Link>
      </header>
      {feedback.error ? <p className={styles.errorNotice}>{feedback.error}</p> : null}
      <AdminOrderForm mode="create" />
    </>
  );
}
