"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function AdminAutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const interval = window.setInterval(() => router.refresh(), seconds * 1000);
    return () => window.clearInterval(interval);
  }, [router, seconds]);
  return null;
}
