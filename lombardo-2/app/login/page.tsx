import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { CustomerLoginForm } from "@/components/customer/CustomerLoginForm";
import { getCurrentCustomerAccount } from "@/lib/server/customers/customer-auth";
import { sanitizeCustomerReturnPath } from "@/lib/server/customers/validation";

import styles from "./page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ingresar | Lombardo",
  description: "Acceso a tu cuenta de Lombardo.",
  robots: { index: false, follow: false },
};

interface LoginPageProps {
  searchParams: Promise<{
    next?: string | string[];
    auth?: string | string[];
    password?: string | string[];
  }>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = sanitizeCustomerReturnPath(
    Array.isArray(params.next) ? params.next[0] : params.next,
  );
  const account = await getCurrentCustomerAccount();
  if (account) redirect(next);
  const notice =
    params.password === "updated"
      ? "Contraseña guardada. Ya podés ingresar."
      : params.auth === "invalid"
        ? "El enlace venció o ya fue utilizado. Solicitá uno nuevo."
        : "";

  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="login-title">
        <p className={styles.eyebrow}>Clientes Lombardo</p>
        <h1 id="login-title">Tu cuenta, tus precios.</h1>
        <p className={styles.intro}>
          Ingresá para ver automáticamente tu política comercial y consultar
          tus pedidos.
        </p>
        {notice ? (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        ) : null}
        <CustomerLoginForm next={next} />
      </section>
    </main>
  );
}
