"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshOrderStatus() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => router.refresh())}
    >
      {pending ? "ACTUALIZANDO…" : "ACTUALIZAR ESTADO"}
    </button>
  );
}
