import "server-only";

import { argentinaDate } from "@/lib/automations/date";
import { buildCompetitorMatcher } from "@/lib/competitors/matcher";
import type { CompetitorRunSummary } from "@/lib/competitors/types";
import { ResendCompetitorAlert } from "./competitor-alert";
import { CompetitorStore } from "./competitor-store";
import { CompetitorSourceError, PositanoCatalogSource } from "./positano-source";

function safeError(error: unknown) {
  return error instanceof Error && error.message
    ? error.message.slice(0, 400)
    : "La corrida terminó con un error no identificado.";
}

export class CompetitorIntelligenceService {
  private readonly store: CompetitorStore;
  private readonly alerter: ResendCompetitorAlert;
  private readonly sourceFactory: (input: { crawlDelayMs: number; maximumPages: number }) => PositanoCatalogSource;
  private readonly now: () => Date;

  constructor(input: {
    store: CompetitorStore;
    alerter?: ResendCompetitorAlert;
    sourceFactory?: (input: { crawlDelayMs: number; maximumPages: number }) => PositanoCatalogSource;
    now?: () => Date;
  }) {
    this.store = input.store;
    this.alerter = input.alerter ?? new ResendCompetitorAlert();
    this.sourceFactory = input.sourceFactory ?? ((options) => new PositanoCatalogSource(options));
    this.now = input.now ?? (() => new Date());
  }

  async run(input: {
    trigger: "schedule" | "manual" | "pilot" | "retry";
    runKey?: string;
    createdBy?: string;
  }): Promise<CompetitorRunSummary> {
    const competitor = await this.store.ensurePositano();
    const runKey = input.runKey ?? `daily:${argentinaDate(this.now())}`;
    const claim = await this.store.claim({
      competitorId: competitor.id,
      runKey,
      trigger: input.trigger,
      createdBy: input.createdBy,
    });
    if (!claim.claimed || !claim.runId) {
      return {
        runId: claim.runId ?? "",
        status: "skipped",
        productsSeen: 0,
        productsParsed: 0,
        high: 0,
        medium: 0,
        low: 0,
        noMatch: 0,
        matched: 0,
        priceChanges: 0,
        alertsCreated: 0,
        alertsSent: 0,
        warnings: [claim.reason ?? "not_claimed"],
      };
    }

    try {
      const previous = await this.store.latestSuccessfulRun(competitor.id);
      const source = this.sourceFactory({
        crawlDelayMs: competitor.crawlDelayMs,
        maximumPages: competitor.maxPages,
      });
      const scrape = await source.scrape();
      if (previous?.structural_signature && previous.structural_signature !== scrape.structuralSignature) {
        throw new CompetitorSourceError("La firma estructural del catálogo cambió desde la última corrida estable.", true);
      }
      if (previous?.products_parsed) {
        const ratio = scrape.products.length / previous.products_parsed;
        if (ratio < 0.65 || ratio > 1.6) {
          throw new CompetitorSourceError(
            `El volumen cambió de ${previous.products_parsed} a ${scrape.products.length}; requiere revisión.`,
            true,
          );
        }
      }

      const runiaProducts = await this.store.loadRuniaProducts();
      const match = buildCompetitorMatcher(runiaProducts);
      const result = await this.store.ingest({
        runId: claim.runId,
        structuralSignature: scrape.structuralSignature,
        pagesFetched: scrape.pagesFetched,
        productsSeen: scrape.objectsDetected,
        products: scrape.products.map((product) => ({ product, match: match(product) })),
      });
      const alerts = await this.store.pendingAlerts(claim.runId);
      let alertsSent = 0;
      if (alerts.length) {
        try {
          const delivery = await this.alerter.sendEvents(claim.runId, alerts);
          await this.store.recordAlertDelivery(claim.runId, alerts.map((event) => event.id), delivery);
          alertsSent = delivery.status === "sent" ? alerts.length : 0;
        } catch (error) {
          await this.store.recordAlertDelivery(claim.runId, alerts.map((event) => event.id), {
            status: "failed",
            error: safeError(error),
          });
        }
      }
      return {
        runId: claim.runId,
        status: "completed",
        productsSeen: scrape.objectsDetected,
        productsParsed: result.parsed,
        high: result.high,
        medium: result.medium,
        low: result.low,
        noMatch: result.noMatch,
        matched: result.matched,
        priceChanges: result.priceChanges,
        alertsCreated: result.alertsCreated,
        alertsSent,
        warnings: [],
      };
    } catch (error) {
      const message = safeError(error);
      const blocked = error instanceof CompetitorSourceError && error.circuitBreaking;
      await this.store.finishFailure({
        runId: claim.runId,
        competitorId: competitor.id,
        status: blocked ? "blocked" : "failed",
        message,
        summary: { retainedStableSnapshot: true, externalSignalsOnly: true },
      });
      if (blocked) {
        try {
          const delivery = await this.alerter.sendCircuitBreaker(claim.runId, message);
          await this.store.recordAlertDelivery(claim.runId, [], delivery);
        } catch (alertError) {
          await this.store.recordAlertDelivery(claim.runId, [], {
            status: "failed",
            error: safeError(alertError),
          });
        }
      }
      return {
        runId: claim.runId,
        status: blocked ? "blocked" : "failed",
        productsSeen: 0,
        productsParsed: 0,
        high: 0,
        medium: 0,
        low: 0,
        noMatch: 0,
        matched: 0,
        priceChanges: 0,
        alertsCreated: 0,
        alertsSent: 0,
        warnings: [message],
      };
    }
  }
}
