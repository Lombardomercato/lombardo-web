"use client";

import Link from "next/link";
import { useEffect } from "react";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import {
  shouldShowWholesaleProgress,
  wholesaleBottleCount,
  wholesaleProgressCopy,
} from "@/lib/pricing/volume-tier-ui";
import type { CartItem } from "@/types/commerce";
import styles from "./WholesaleProgress.module.css";

export function WholesaleProgress({
  items,
  compact = false,
  checkout = false,
}: {
  items: CartItem[];
  compact?: boolean;
  checkout?: boolean;
}) {
  const count = wholesaleBottleCount(items);
  const visible = shouldShowWholesaleProgress(items) && (!checkout || count === 4 || count === 5);
  const cappedCount = Math.min(count, 6);
  const thresholdReached = count >= 6;
  const priceApplied = items.some((item) => item.product.automaticWholesale);

  useEffect(() => {
    if (!visible) return;
    const state = thresholdReached ? "active" : String(cappedCount);
    const seenKey = `lombardo-wholesale-progress-seen:${state}`;
    if (!window.sessionStorage.getItem(seenKey)) {
      window.sessionStorage.setItem(seenKey, "1");
      trackCommerceEvent({ name: "wholesale_progress_seen", bottleCount: count });
    }
    if (thresholdReached && !window.sessionStorage.getItem("lombardo-wholesale-threshold-reached")) {
      window.sessionStorage.setItem("lombardo-wholesale-threshold-reached", "1");
      trackCommerceEvent({ name: "wholesale_threshold_reached", bottleCount: count });
    }
    if (priceApplied && !window.sessionStorage.getItem("lombardo-wholesale-price-applied")) {
      window.sessionStorage.setItem("lombardo-wholesale-price-applied", "1");
      trackCommerceEvent({ name: "wholesale_price_applied", bottleCount: count });
    }
  }, [thresholdReached, count, priceApplied, visible, cappedCount]);

  if (!visible) return null;

  return (
    <aside
      className={styles.progress}
      data-active={thresholdReached ? "true" : "false"}
      data-compact={compact ? "true" : "false"}
      aria-label="Beneficio por cantidad"
    >
      <div className={styles.topline}>
        <span>{cappedCount} / 6 BOTELLAS</span>
        {!thresholdReached && !checkout ? (
          <Link
            href="/productos?category=vinos"
            onClick={() => trackCommerceEvent({
              name: "wholesale_progress_clicked",
              bottleCount: count,
            })}
          >
            SUMAR BOTELLAS →
          </Link>
        ) : null}
      </div>
      <div className={styles.dots} aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} data-filled={index < cappedCount ? "true" : "false"} />
        ))}
      </div>
      <p>{wholesaleProgressCopy(count, priceApplied)}</p>
      {!thresholdReached && count > 1 ? <small>No hace falta llevar seis iguales.</small> : null}
    </aside>
  );
}
