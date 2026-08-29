import type { NextRequest } from "next/server";

import { updateCustomerSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateCustomerSession(request);
}

export const config = {
  matcher: [
    "/",
    "/productos/:path*",
    "/categorias/:path*",
    "/guias/:path*",
    "/carrito/:path*",
    "/checkout/:path*",
    "/login/:path*",
    "/auth/:path*",
    "/nueva-clave/:path*",
    "/recuperar-clave/:path*",
    "/mi-cuenta/:path*",
    "/api/catalog/:path*",
    "/api/orders/:path*",
  ],
};
