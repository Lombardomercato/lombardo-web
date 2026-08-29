"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect } from "react";

interface CustomerAuthCallbackProps {
  publishableKey: string;
  supabaseUrl: string;
}

function safeNextPath(value: string | null) {
  return value === "/nueva-clave" ? value : "/nueva-clave";
}

export function CustomerAuthCallback({
  publishableKey,
  supabaseUrl,
}: CustomerAuthCallbackProps) {
  useEffect(() => {
    let cancelled = false;

    async function completeAuthentication() {
      const current = new URL(window.location.href);
      const next = safeNextPath(current.searchParams.get("next"));
      const code = current.searchParams.get("code");

      if (code) {
        const confirm = new URL("/auth/confirm", window.location.origin);
        confirm.searchParams.set("code", code);
        confirm.searchParams.set("next", next);
        window.location.replace(confirm.toString());
        return;
      }

      const hash = new URLSearchParams(current.hash.replace(/^#/, ""));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");
      if (!accessToken || !refreshToken) {
        window.location.replace("/login?auth=invalid");
        return;
      }

      const supabase = createBrowserClient(supabaseUrl, publishableKey, {
        auth: {
          detectSessionInUrl: false,
          flowType: "implicit",
        },
      });
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (!cancelled) {
        window.location.replace(error ? "/login?auth=invalid" : next);
      }
    }

    void completeAuthentication();
    return () => {
      cancelled = true;
    };
  }, [publishableKey, supabaseUrl]);

  return (
    <main style={{ minHeight: "55vh", display: "grid", placeItems: "center" }}>
      <p>Validando el enlace seguro…</p>
    </main>
  );
}
