import Link from "next/link";
import { redirect } from "next/navigation";

import { CustomerAdminForm } from "@/components/admin/CustomerAdminForm";
import { requireAdminSession } from "@/lib/server/admin/admin-auth";

import styles from "../../../admin.module.css";

export default async function NewAdminCustomerPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireAdminSession();
  if (session.role !== "admin") redirect("/admin/clientes");
  const { error } = await searchParams;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>NUEVA CUENTA</p>
          <h1>CREAR CLIENTE.</h1>
        </div>
        <Link href="/admin/clientes">← VOLVER A CLIENTES</Link>
      </header>
      {error ? <p className={styles.formError}>{error}</p> : null}
      <CustomerAdminForm />
    </>
  );
}
