import Link from "next/link";
import { logoutAdminAction } from "@/app/admin/actions";
import type { AdminSession } from "@/lib/server/admin/types";
import styles from "@/app/admin/admin.module.css";

export function AdminShell({
  session,
  newOrders,
  children,
}: {
  session: AdminSession;
  newOrders: number;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.adminRoot}>
      <header className={styles.adminHeader}>
        <Link className={styles.adminBrand} href="/admin">
          <strong>LOMBARDO<span className={styles.adminTrademark} aria-hidden="true">™</span></strong>
          <span>ADMIN</span>
        </Link>
        <div className={styles.operatorMenu}>
          <span>{session.displayName}</span>
          <form action={logoutAdminAction}>
            <button type="submit">SALIR</button>
          </form>
        </div>
      </header>
      <nav className={styles.adminNav} aria-label="Administración">
        <Link href="/admin">RESUMEN</Link>
        <Link href="/admin/pedidos">
          PEDIDOS
          {newOrders > 0 ? <strong>{newOrders}</strong> : null}
        </Link>
        <Link href="/admin/productos">PRODUCTOS</Link>
        <Link href="/admin/vinros">VINROS HEALTH</Link>
        <Link href="/admin/automatizaciones">AUTOMATIZACIONES</Link>
        <Link href="/admin/asistente">ASISTENTE BETA</Link>
        <Link href="/admin/competencia">COMPETENCIA</Link>
        <Link href="/admin/imagenes">IMÁGENES</Link>
        <Link href="/admin/clientes">CLIENTES</Link>
        <Link href="/admin/promociones">PROMOCIONES</Link>
        <Link href="/admin/cava-secreta">CAVA SECRETA</Link>
      </nav>
      <main className={styles.adminMain}>{children}</main>
    </div>
  );
}
