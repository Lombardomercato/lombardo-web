import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomerPasswordForm } from "@/components/customer/CustomerPasswordForm";
import { getCurrentCustomerAccount } from "@/lib/server/customers/customer-auth";

import styles from "@/app/login/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Nueva contraseña | Lombardo",
  robots: { index: false, follow: false },
};

export default async function NewPasswordPage() {
  const account = await getCurrentCustomerAccount();
  if (!account) redirect("/login?auth=invalid");

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="password-title">
        <p className={styles.eyebrow}>Acceso de clientes</p>
        <h1 id="password-title">Elegí tu clave.</h1>
        <p className={styles.intro}>
          Usá al menos 10 caracteres. Después vas a ingresar nuevamente con tu
          email y la contraseña elegida.
        </p>
        <CustomerPasswordForm />
      </section>
    </main>
  );
}
