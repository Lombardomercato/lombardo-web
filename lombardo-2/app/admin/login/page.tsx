import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminLoginForm } from "@/components/admin/AdminLoginForm";
import { getOptionalAdminSession } from "@/lib/server/admin/admin-auth";
import styles from "../admin.module.css";

export const metadata: Metadata = {
  title: "Acceso · Lombardo Admin",
  robots: { index: false, follow: false },
};

export default async function AdminLoginPage() {
  if (await getOptionalAdminSession()) redirect("/admin");
  return (
    <div className={styles.loginRoot}>
      <section className={styles.loginCard}>
        <p className={styles.eyebrow}>OPERACIÓN REAL</p>
        <h1>LOMBARDO<span className={styles.adminTrademark} aria-hidden="true">™</span><br />ADMIN.</h1>
        <p>Acceso exclusivo para operadores autorizados.</p>
        <AdminLoginForm />
      </section>
    </div>
  );
}
