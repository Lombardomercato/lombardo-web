import "server-only";

import { readRuniaConfiguration } from "@/lib/server/environment";
import { CompetitorIntelligenceService } from "./competitor-service";
import { CompetitorStore } from "./competitor-store";

export function createCompetitorServices() {
  const configuration = readRuniaConfiguration();
  const store = new CompetitorStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
    tenantSlug: configuration.tenantSlug,
  });
  return { store, service: new CompetitorIntelligenceService({ store }) };
}
