import type { Metadata } from "next";
import { AdminAutoRefresh } from "@/components/admin/AdminAutoRefresh";
import { AdminShell } from "@/components/admin/AdminShell";
import { createAdminStore, requireAdminSession } from "@/lib/server/admin/admin-auth";

export const metadata: Metadata = {
  title: "Lombardo Admin",
  robots: { index: false, follow: false },
};

export default async function ProtectedAdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await requireAdminSession();
  const dashboard = await createAdminStore().getDashboard();
  return (
    <AdminShell session={session} newOrders={dashboard.newOrders}>
      <AdminAutoRefresh seconds={30} />
      {children}
    </AdminShell>
  );
}
