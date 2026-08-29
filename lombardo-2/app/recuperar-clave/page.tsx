import type { Metadata } from "next";
import Link from "next/link";

import { CustomerRecoveryForm } from "@/components/customer/CustomerRecoveryForm";

import styles from "@/app/login/page.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Recuperar contraseña | Lombardo",
  robots: { index: false, follow: false },
};

export default function RecoverPasswordPage() {
  return (
    <main className={styles.page}>
      <section className={styles.panel} aria-labelledby="recovery-title">
        <p className={styles.eyebrow}>Acceso de clientes</p>
        <h1 id="recovery-title">Recuperar acceso.</h1>
        <p className={styles.intro}>
          Te enviaremos un enlace seguro para elegir una contraseña nueva.
        </p>
        <CustomerRecoveryForm />
        <p className={styles.intro}>
          <Link href="/login">← Volver a ingresar</Link>
        </p>
      </section>
    </main>
  );
}
