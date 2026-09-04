import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomerRegistrationForm } from "@/components/customer/CustomerRegistrationForm";
import { getCurrentCustomerAccount } from "@/lib/server/customers/customer-auth";

import styles from "../login/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Crear cuenta | Lombardo",
  description: "Creá tu cuenta de consumidor final en Lombardo.",
  robots: { index: false, follow: false },
};

export default async function CustomerRegistrationPage() {
  const account = await getCurrentCustomerAccount();
  if (account) redirect("/mi-cuenta");

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="registration-title">
        <p className={styles.eyebrow}>Nueva cuenta</p>
        <h1 id="registration-title">Todo queda guardado.</h1>
        <p className={styles.intro}>
          Creá tu acceso para guardar tus datos y dirección, consultar pedidos
          y comprar más rápido la próxima vez.
        </p>
        <CustomerRegistrationForm />
      </section>
    </main>
  );
}
