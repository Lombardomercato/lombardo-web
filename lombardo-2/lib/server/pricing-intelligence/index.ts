import "server-only";

import { readRuniaConfiguration } from "@/lib/server/environment";
import { PricingIntelligenceStore } from "./pricing-store";

export function createPricingIntelligenceServices() {
  const configuration = readRuniaConfiguration();
  return {
    store: new PricingIntelligenceStore({
      url: configuration.url,
      secretKey: configuration.secretKey,
      tenantSlug: configuration.tenantSlug,
    }),
  };
}

