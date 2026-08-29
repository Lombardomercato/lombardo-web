import type { Metadata } from "next";

import { CustomerAuthCallback } from "@/components/customer/CustomerAuthCallback";
import { readAdminConfiguration } from "@/lib/server/environment";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Validar acceso | Lombardo",
  robots: { index: false, follow: false },
};

export default function AuthCallbackPage() {
  const { publishableKey, url } = readAdminConfiguration();
  return (
    <CustomerAuthCallback publishableKey={publishableKey} supabaseUrl={url} />
  );
}
