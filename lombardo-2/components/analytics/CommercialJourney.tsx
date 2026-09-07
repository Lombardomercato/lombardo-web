"use client";

import Link from "next/link";
import { useEffect, type ComponentProps } from "react";
import { trackCommerceEvent, type CommerceEvent } from "@/lib/analytics/commerce-events";

type AccountType = "WHOLESALE" | "BUSINESS";

export function CommercialPageView({
  name,
  accountType,
}: {
  name: "portal_negocios_opened" | "pedido_rapido_opened";
  accountType: AccountType;
}) {
  useEffect(() => {
    trackCommerceEvent({ name, accountType });
  }, [accountType, name]);
  return null;
}

export function TrackedCommercialLink({
  event,
  ...props
}: ComponentProps<typeof Link> & { event: CommerceEvent }) {
  return (
    <Link
      {...props}
      onClick={(clickEvent) => {
        trackCommerceEvent(event);
        props.onClick?.(clickEvent);
      }}
    />
  );
}
