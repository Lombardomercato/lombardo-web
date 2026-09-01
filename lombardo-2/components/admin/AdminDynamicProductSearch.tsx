"use client";

import { useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";

export function AdminDynamicProductSearch({
  initialValue,
}: {
  initialValue: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<number | undefined>(undefined);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    return () => window.clearTimeout(timerRef.current);
  }, []);

  function handleChange(value: string) {
    window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      const normalized = value.trim();
      const next = new URLSearchParams(window.location.search);
      if ((next.get("buscar") ?? "") === normalized) return;
      if (normalized) next.set("buscar", normalized);
      else next.delete("buscar");
      next.delete("offset");
      startTransition(() => {
        router.replace(`${pathname}?${next.toString()}`, { scroll: false });
      });
    }, 300);
  }

  return (
    <>
      <input
        id="buscar"
        name="buscar"
        defaultValue={initialValue}
        onChange={(event) => handleChange(event.target.value)}
        placeholder="SKU, nombre, marca o presentación"
        autoComplete="off"
        aria-describedby="admin-product-search-status"
      />
      <span id="admin-product-search-status" aria-live="polite">
        {isPending ? "Buscando…" : ""}
      </span>
    </>
  );
}
