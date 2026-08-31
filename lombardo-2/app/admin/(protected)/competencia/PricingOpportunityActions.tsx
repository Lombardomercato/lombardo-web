import Link from "next/link";
import {
  applyLombardoSellingPriceAction,
  ignorePricingOpportunityAction,
  setCommercialSensitivityAction,
} from "@/app/admin/actions";
import { COMMERCIAL_SENSITIVITIES, type PricingOpportunity } from "@/lib/pricing-intelligence/types";
import styles from "./CompetitorDashboard.module.css";

const SENSITIVITY_LABELS = {
  known_comparable: "KNOWN / COMPARABLE",
  long_tail: "LONG TAIL",
  premium: "PREMIUM",
  gift: "GIFT",
  traffic_driver: "TRAFFIC DRIVER",
} as const;

function ExpectedFields({ opportunity }: { opportunity: PricingOpportunity }) {
  return (
    <>
      <input type="hidden" name="competitorProductId" value={opportunity.competitorProductId} />
      <input type="hidden" name="runiaProductId" value={opportunity.runiaProductId} />
      <input type="hidden" name="expectedCurrentPrice" value={opportunity.lombardoSellingPrice} />
      <input type="hidden" name="expectedVersion" value={opportunity.sellingPriceVersion} />
      <input type="hidden" name="expectedSupplierCost" value={opportunity.supplierCost ?? ""} />
      <input type="hidden" name="expectedCompetitorPrice" value={opportunity.competitorPrice} />
      <input type="hidden" name="expectedCompetitorFetchedAt" value={opportunity.competitorFetchedAt} />
    </>
  );
}

export function PricingOpportunityActions({ opportunity, compact = false }: {
  opportunity: PricingOpportunity;
  compact?: boolean;
}) {
  const recommendation = opportunity.recommendation;
  return (
    <div className={styles.pricingActions} data-compact={compact}>
      <Link className={styles.detailLink} href={`/admin/competencia/${opportunity.competitorProductId}`}>
        REVISAR
      </Link>
      {recommendation?.price !== undefined && opportunity.supplierCost ? (
        <form action={applyLombardoSellingPriceAction}>
          <ExpectedFields opportunity={opportunity} />
          <input type="hidden" name="newPrice" value={recommendation.price} />
          <input type="hidden" name="reason" value="COMPETITOR_REVIEW" />
          <input type="hidden" name="approvalSource" value="PRICING_INTELLIGENCE" />
          <button type="submit">APROBAR PRECIO</button>
        </form>
      ) : <span className={styles.guardrail}>SIN PRECIO APROBABLE</span>}
      <form action={ignorePricingOpportunityAction}>
        <input type="hidden" name="competitorProductId" value={opportunity.competitorProductId} />
        <button data-action="secondary" type="submit">IGNORAR</button>
      </form>
      {!compact ? (
        <details className={styles.manualPrice}>
          <summary>FIJAR MANUALMENTE</summary>
          <form action={applyLombardoSellingPriceAction}>
            <ExpectedFields opportunity={opportunity} />
            <input type="hidden" name="approvalSource" value="ADMIN" />
            <label><span>NUEVO PRECIO</span><input name="newPrice" type="number" min="0.01" step="0.01" required /></label>
            <label><span>MOTIVO</span><select name="reason" defaultValue="MANUAL"><option>MANUAL</option><option>COMPETITOR_REVIEW</option><option>PROMOTION</option><option>OTHER</option></select></label>
            {opportunity.commercialSensitivity === "traffic_driver" ? (
              <label className={styles.permission}><input name="allowAtOrBelowCost" type="checkbox" /><span>PERMITIR ≤ COSTO EXPLÍCITAMENTE</span></label>
            ) : null}
            <button type="submit">APROBAR PRECIO MANUAL</button>
          </form>
        </details>
      ) : (
        <Link className={styles.detailLink} href={`/admin/competencia/${opportunity.competitorProductId}#precio-manual`}>
          FIJAR MANUALMENTE
        </Link>
      )}
      {!compact ? (
        <form action={setCommercialSensitivityAction} className={styles.sensitivityForm}>
          <input type="hidden" name="competitorProductId" value={opportunity.competitorProductId} />
          <input type="hidden" name="runiaProductId" value={opportunity.runiaProductId} />
          <label><span>SENSIBILIDAD</span><select name="sensitivity" defaultValue={opportunity.commercialSensitivity}>{COMMERCIAL_SENSITIVITIES.map((item) => <option key={item} value={item}>{SENSITIVITY_LABELS[item]}</option>)}</select></label>
          <button data-action="secondary" type="submit">GUARDAR CLASIFICACIÓN</button>
        </form>
      ) : null}
    </div>
  );
}
