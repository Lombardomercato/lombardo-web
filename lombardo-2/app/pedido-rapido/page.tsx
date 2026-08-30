import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { QuickOrderWorkspace } from "@/components/quick-order/QuickOrderWorkspace";
import styles from "@/components/quick-order/QuickOrderWorkspace.module.css";
import { resolveQuickOrderAccess } from "@/lib/quick-order/types";
import { getCurrentCustomerAccessState } from "@/lib/server/customers/customer-auth";
import { getLatestRepeatableOrder } from "@/lib/server/customers/customer-data";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pedido Rápido B2B",
  description: "Pedido compacto para cuentas mayoristas y negocios Lombardo.",
  robots: { index: false, follow: false },
};

function AccessDenied({ reason }: { reason: "INACTIVE" | "RETAIL" }) {
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroTopline}>
          <span>PEDIDO RÁPIDO / B2B</span>
          <span>ACCESO DE CUENTA</span>
        </div>
        <div className={styles.heroCopy}>
          <h1>ACCESO<br />B2B.</h1>
          <div>
            <p>
              {reason === "INACTIVE"
                ? "Tu sesión está activa, pero la cuenta comercial no está habilitada."
                : "Pedido Rápido está disponible para cuentas Mayorista y Negocio."}
            </p>
            <p>
              Podés seguir usando el catálogo retail o hablar con Lombardo para
              revisar tu cuenta.
            </p>
          </div>
        </div>
        <nav className={styles.modeNav} aria-label="Opciones disponibles">
          <Link href="/productos">IR AL CATÁLOGO</Link>
          <Link href="/#contacto">HABLAR CON LOMBARDO</Link>
        </nav>
      </section>
    </main>
  );
}

export default async function QuickOrderPage() {
  const state = await getCurrentCustomerAccessState();
  const access = resolveQuickOrderAccess(state.authUserId, state.account);
  if (!access.allowed) {
    if (access.reason === "SIGNED_OUT") {
      redirect("/login?next=%2Fpedido-rapido");
    }
    return <AccessDenied reason={access.reason} />;
  }

  const latestOrder = await getLatestRepeatableOrder(access.account);
  return (
    <QuickOrderWorkspace
      accountName={access.account.name}
      accountType={access.account.accountType}
      latestOrder={latestOrder}
    />
  );
}
