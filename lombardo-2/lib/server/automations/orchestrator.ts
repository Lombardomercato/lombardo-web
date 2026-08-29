import "server-only";

import type {
  AutomationExecutionResult,
  AutomationRun,
  AutomationStatus,
  AutomationTaskResult,
  AutomationTrigger,
  AutomationType,
} from "../../automations/types.ts";
import { AUTOMATION_TYPES } from "../../automations/types.ts";
import { argentinaDate } from "../../automations/date.ts";
import type { AutomationAlertPort } from "./automation-alert.ts";

export interface AutomationRunStore {
  claim(input: {
    type: AutomationType;
    runKey: string;
    trigger: AutomationTrigger;
    createdBy?: string;
  }): Promise<{ claimed: boolean; reason?: string; runId?: string; attempt?: number }>;
  finishRun(input: {
    runId: string;
    status: Exclude<AutomationStatus, "running">;
    summary: Record<string, unknown>;
    warnings?: string[];
    errors?: string[];
    alertRequired?: boolean;
  }): Promise<void>;
  recordAlert(runId: string, input: {
    status: "sent" | "failed";
    messageId?: string;
    error?: string;
  }): Promise<void>;
}

export type AutomationTask = (input: {
  runId: string;
  date: string;
  trigger: AutomationTrigger;
}) => Promise<AutomationTaskResult>;

function publicError(error: unknown) {
  if (error instanceof Error && error.message) return error.message.slice(0, 300);
  return "La tarea terminó con un error no identificado.";
}

export class AutomationOrchestrator {
  private readonly store: AutomationRunStore;
  private readonly tasks: Record<AutomationType, AutomationTask>;
  private readonly alerter: AutomationAlertPort;
  private readonly now: () => Date;

  constructor(
    store: AutomationRunStore,
    tasks: Record<AutomationType, AutomationTask>,
    alerter: AutomationAlertPort,
    now: () => Date = () => new Date(),
  ) {
    this.store = store;
    this.tasks = tasks;
    this.alerter = alerter;
    this.now = now;
  }

  async run(input: {
    type: AutomationType;
    trigger: AutomationTrigger;
    runKey?: string;
    createdBy?: string;
  }): Promise<AutomationExecutionResult> {
    const date = argentinaDate(this.now());
    const runKey = input.runKey ?? `${input.trigger}:${date}`;
    const claim = await this.store.claim({ ...input, runKey });
    if (!claim.claimed || !claim.runId) {
      return {
        claimed: false,
        type: input.type,
        status: "skipped",
        summary: {},
        reason: claim.reason ?? "not_claimed",
      };
    }

    const run = { id: claim.runId, type: input.type } satisfies Pick<AutomationRun, "id" | "type">;
    try {
      const result = await this.tasks[input.type]({
        runId: claim.runId,
        date,
        trigger: input.trigger,
      });
      const warnings = result.warnings ?? [];
      const alertRequired = result.status === "blocked" || Boolean(result.requiresReview);
      await this.store.finishRun({
        runId: claim.runId,
        status: result.status,
        summary: result.summary,
        warnings,
        alertRequired,
      });
      if (alertRequired) {
        await this.sendAlert(run, result.status, result.summary, warnings);
      }
      return {
        claimed: true,
        runId: claim.runId,
        type: input.type,
        status: result.status,
        summary: result.summary,
      };
    } catch (error) {
      const message = publicError(error);
      await this.store.finishRun({
        runId: claim.runId,
        status: "failed",
        summary: { retainedStableFallback: input.type === "daily_featured" },
        errors: [message],
        alertRequired: true,
      });
      await this.sendAlert(run, "failed", { retainedStableFallback: true }, [message]);
      return {
        claimed: true,
        runId: claim.runId,
        type: input.type,
        status: "failed",
        summary: { retainedStableFallback: input.type === "daily_featured" },
      };
    }
  }

  private async sendAlert(
    run: Pick<AutomationRun, "id" | "type">,
    status: AutomationStatus,
    summary: Record<string, unknown>,
    errors: string[],
  ) {
    try {
      const sent = await this.alerter.send({ run, status, summary, errors });
      try {
        await this.store.recordAlert(run.id, { status: "sent", messageId: sent.messageId });
      } catch {
        // Delivery already succeeded. A transient audit failure must not rerun the task.
      }
    } catch (error) {
      try {
        await this.store.recordAlert(run.id, { status: "failed", error: publicError(error) });
      } catch {
        // The main run is already closed; the next Admin read will expose the pending alert.
      }
    }
  }

  async runDaily(trigger: AutomationTrigger = "schedule") {
    const date = argentinaDate(this.now());
    const results: AutomationExecutionResult[] = [];
    for (const type of AUTOMATION_TYPES) {
      try {
        results.push(await this.run({ type, trigger, runKey: `daily:${date}` }));
      } catch {
        results.push({
          claimed: false,
          type,
          status: "failed",
          summary: {},
          reason: "orchestrator_store_unavailable",
        });
      }
    }
    return results;
  }
}
