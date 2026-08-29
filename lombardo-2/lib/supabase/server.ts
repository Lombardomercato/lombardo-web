import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import { readAdminConfiguration } from "@/lib/server/environment";

/**
 * Creates one caller-scoped Supabase client for the current request.
 *
 * This client intentionally uses the publishable key: database authorization
 * must be enforced by the signed customer session and RLS, never by the
 * service-role credential used by back-office integrations.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  const { publishableKey, url } = readAdminConfiguration();

  return createServerClient(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. The root proxy refreshes
          // sessions before rendering; Server Actions can write them here.
        }
      },
    },
  });
}
