import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  isApiPath,
  isMaintenanceBypassPath,
  isMaintenanceModeEnabled,
} from "@/lib/maintenance";
import { updateCustomerSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  if (isMaintenanceModeEnabled()) {
    const { pathname } = request.nextUrl;

    if (isMaintenanceBypassPath(pathname)) {
      return pathname.startsWith("/auth/")
        ? updateCustomerSession(request)
        : NextResponse.next();
    }

    if (isApiPath(pathname)) {
      return NextResponse.json(
        { error: "Lombardo está temporalmente fuera de servicio." },
        {
          status: 503,
          headers: {
            "Cache-Control": "no-store, max-age=0",
            "Retry-After": "86400",
          },
        },
      );
    }

    const maintenanceUrl = request.nextUrl.clone();
    maintenanceUrl.pathname = "/en-construccion";
    maintenanceUrl.search = "";

    return NextResponse.rewrite(maintenanceUrl);
  }

  return updateCustomerSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.jpg|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff|woff2|otf|ttf)$).*)",
  ],
};
