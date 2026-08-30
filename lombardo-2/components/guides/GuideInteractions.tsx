"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";

export function GuideViewTracker({ guideSlug }: { guideSlug: string }) {
  useEffect(() => {
    trackCommerceEvent({ name: "guide_view", guideSlug });
  }, [guideSlug]);
  return null;
}

export function GuideShare({ guideSlug, title }: { guideSlug: string; title: string }) {
  const [message, setMessage] = useState("");

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        trackCommerceEvent({ name: "guide_share", guideSlug, channel: "native" });
        setMessage("Compartido.");
        return;
      }
      await navigator.clipboard.writeText(url);
      trackCommerceEvent({ name: "guide_share", guideSlug, channel: "copy" });
      setMessage("Enlace copiado.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("No pudimos compartir el enlace.");
    }
  }

  return (
    <div>
      <button type="button" onClick={share}>COMPARTIR ↗</button>
      <span aria-live="polite">{message}</span>
    </div>
  );
}

export function GuideRelatedLink({
  guideSlug,
  relatedSlug,
  children,
  className,
}: {
  guideSlug: string;
  relatedSlug: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={`/guias/${relatedSlug}`}
      className={className}
      onClick={() => trackCommerceEvent({ name: "guide_related_click", guideSlug, relatedSlug })}
    >
      {children}
    </Link>
  );
}
