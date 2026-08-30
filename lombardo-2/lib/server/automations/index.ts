import "server-only";

import { readRuniaConfiguration } from "@/lib/server/environment";
import { AutomationStore } from "./automation-store";
import { ResendAutomationAlert } from "./automation-alert";
import { AutomationOrchestrator } from "./orchestrator";
import { createAutomationTasks } from "./tasks";

export function createAutomationServices() {
  const configuration = readRuniaConfiguration();
  const store = new AutomationStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
    tenantSlug: configuration.tenantSlug,
  });
  const orchestrator = new AutomationOrchestrator(
    store,
    createAutomationTasks({ store, tenantSlug: configuration.tenantSlug }),
    new ResendAutomationAlert(),
  );
  return { store, orchestrator };
}
