import Link from "next/link";
import { notFound } from "next/navigation";
import { setCompetitorMatchAction } from "@/app/admin/actions";
import { formatAdminDate } from "@/lib/admin/presentation";
import { createCompetitorServices } from "@/lib/server/competitors";
import { createPricingIntelligenceServices } from "@/lib/server/pricing-intelligence";
import { formatCurrency } from "@/lib/utils/format-currency";
import { PricingOpportunityActions } from "../PricingOpportunityActions";
import styles from "../../../admin.module.css";
import localStyles from "../CompetitorDashboard.module.css";

function text(value: string | undefined) {
  return value ?? "";
}

function percentage(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

const POSITION_LABELS = {
  very_competitive: "MUY COMPETITIVO",
  competitive: "COMPETITIVO",
  in_market: "EN MERCADO",
  expensive: "CARO",
  very_expensive: "MUY CARO",
} as const;

const SCENARIO_LABELS = {
  match_competitor: "MATCH COMPETITOR",
  competitor_plus_5: "COMPETITOR +5%",
  competitor_minus_5: "COMPETITOR -5%",
  target_margin: "TARGET MARGIN",
} as const;

const GUARDRAIL_LABELS = {
  MISSING_COST: "SIN COSTO",
  PRICE_AT_OR_BELOW_COST: "≤ COSTO · BLOQUEADO",
  MINIMUM_MARGIN: "BAJO MARGEN MÍNIMO",
} as const;

export default async function CompetitorProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const pricingStore = createPricingIntelligenceServices().store;
  const [detail, pricing] = await Promise.all([
    createCompetitorServices().store.productDetail(id),
    pricingStore.opportunities(),
  ]);
  if (!detail) notFound();
  const row = detail.row;
  const opportunity = pricing.opportunities.find((item) => item.competitorProductId === id);
  const sellingHistory = opportunity
    ? await pricingStore.sellingPriceHistory(opportunity.runiaProductId)
    : [];

  return (
    <>
      <Link className={localStyles.backLink} href="/admin/competencia">← VOLVER A COMPETENCIA</Link>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>POSITANO · MATCH INDIVIDUAL</p><h1>{row.externalName}</h1></div>
        <a className={localStyles.detailLink} href={row.externalProductUrl} target="_blank" rel="noreferrer">VER FUENTE PÚBLICA ↗</a>
      </header>

      {feedback.success ? <p className={localStyles.feedback} role="status">{feedback.success}</p> : null}
      {feedback.error ? <p className={localStyles.error} role="alert">{feedback.error}</p> : null}

      <section className={localStyles.detailGrid}>
        <article className={localStyles.detailCard}>
          <h2>POSITANO</h2>
          <strong className={localStyles.priceHero}>{row.currentPrice ? formatCurrency(row.currentPrice) : "SIN PRECIO"}</strong>
          <dl className={localStyles.facts}>
            <div><dt>Lista anterior</dt><dd>{row.listPrice ? formatCurrency(row.listPrice) : "—"}</dd></div>
            <div><dt>Promoción</dt><dd>{row.promotionText ?? "—"}</dd></div>
            <div><dt>Marca</dt><dd>{row.brand}</dd></div>
            <div><dt>Capturado</dt><dd>{formatAdminDate(row.fetchedAt)}</dd></div>
          </dl>
        </article>
        <article className={localStyles.detailCard}>
          <h2>LOMBARDO SELLING PRICE</h2>
          <strong className={localStyles.priceHero}>{row.lombardoRetailPrice ? formatCurrency(row.lombardoRetailPrice) : "SIN MATCH"}</strong>
          <dl className={localStyles.facts}>
            <div><dt>Diferencia $</dt><dd>{row.differenceAmount === undefined ? "—" : formatCurrency(row.differenceAmount)}</dd></div>
            <div><dt>Diferencia %</dt><dd>{percentage(row.differencePct)}</dd></div>
            <div><dt>Producto Runia</dt><dd>{row.runiaName ?? "—"}</dd></div>
            <div><dt>SKU</dt><dd>{row.runiaSku ?? "—"}</dd></div>
          </dl>
        </article>
      </section>

      {opportunity ? (
        <>
          <section className={localStyles.detailCard}>
            <h2>PRECIO / MARGEN</h2>
            <dl className={localStyles.facts}>
              <div><dt>Costo VINROS</dt><dd>{opportunity.supplierCost ? formatCurrency(opportunity.supplierCost) : "SIN COSTO · MARGEN NO CALCULABLE"}</dd></div>
              <div><dt>Retail VINROS</dt><dd>{formatCurrency(opportunity.supplierRetail)}</dd></div>
              <div><dt>Precio público Lombardo</dt><dd>{formatCurrency(opportunity.lombardoSellingPrice)} · {opportunity.sellingPriceSource === "LOMBARDO_SELLING_PRICE" ? "CAPA LOMBARDO" : "FALLBACK VINROS"}</dd></div>
              <div><dt>Positano</dt><dd>{formatCurrency(opportunity.competitorPrice)}</dd></div>
              <div><dt>Diferencia</dt><dd>{formatCurrency(opportunity.differenceAmount)} · {percentage(opportunity.differencePct)}</dd></div>
              <div><dt>Margen bruto</dt><dd>{opportunity.currentMargin ? `${formatCurrency(opportunity.currentMargin.amount)} · ${percentage(opportunity.currentMargin.percentage)}` : "NO CALCULABLE"}</dd></div>
              <div><dt>Markup</dt><dd>{opportunity.currentMargin ? percentage(opportunity.currentMargin.markupPercentage) : "NO CALCULABLE"}</dd></div>
              <div><dt>Price position</dt><dd><span className={localStyles.position} data-position={opportunity.position}>{POSITION_LABELS[opportunity.position]}</span></dd></div>
              <div><dt>Último cambio VINROS</dt><dd>{opportunity.vinrosChangedAt ? formatAdminDate(opportunity.vinrosChangedAt) : "SIN CAMBIO REGISTRADO"}</dd></div>
              <div><dt>Último cambio competencia</dt><dd>{opportunity.competitorPriceChangedAt ? formatAdminDate(opportunity.competitorPriceChangedAt) : `SIN CAMBIO · observado ${formatAdminDate(opportunity.competitorFetchedAt)}`}</dd></div>
              <div><dt>Sensibilidad</dt><dd>{opportunity.commercialSensitivity.toLocaleUpperCase("es-AR").replaceAll("_", " ")} · {opportunity.classificationSource.toLocaleUpperCase("es-AR")}</dd></div>
            </dl>
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}><h2>ESCENARIOS COMERCIALES</h2><span>RECOMENDACIÓN · NO AUTOMATIZACIÓN</span></div>
            <div className={localStyles.tableWrap}>
              <table className={localStyles.historyTable}>
                <thead><tr><th>ESCENARIO</th><th>PRECIO</th><th>MARGEN $</th><th>MARGEN %</th><th>DIF. MERCADO</th><th>ESTADO</th></tr></thead>
                <tbody>{opportunity.scenarios.map((scenario) => <tr key={scenario.type}><td>{SCENARIO_LABELS[scenario.type]}</td><td>{scenario.price ? formatCurrency(scenario.price) : "—"}</td><td>{scenario.margin ? formatCurrency(scenario.margin.amount) : "—"}</td><td>{scenario.margin ? percentage(scenario.margin.percentage) : "—"}</td><td>{percentage(scenario.marketDifferencePct)}</td><td><strong>{scenario.eligible ? "ELEGIBLE" : scenario.guardrail ? GUARDRAIL_LABELS[scenario.guardrail] : "BLOQUEADO"}</strong></td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className={localStyles.detailCard} id="precio-manual">
            <h2>DECISIÓN HUMANA</h2>
            <p>Antes de aplicar, el sistema vuelve a validar costo, precio competidor, match y versión del selling price.</p>
            <PricingOpportunityActions opportunity={opportunity} />
          </section>

          <section className={styles.section}>
            <div className={styles.sectionTitle}><h2>HISTORIAL DE PRECIO LOMBARDO</h2><span>{sellingHistory.length}</span></div>
            {sellingHistory.length ? <div className={localStyles.tableWrap}><table className={localStyles.historyTable}><thead><tr><th>FECHA</th><th>ANTES</th><th>DESPUÉS</th><th>MOTIVO</th><th>FUENTE</th><th>APROBADO POR</th></tr></thead><tbody>{sellingHistory.map((point) => <tr key={point.id}><td>{formatAdminDate(point.changedAt)}</td><td>{formatCurrency(point.oldPrice)}</td><td>{formatCurrency(point.newPrice)}</td><td>{point.reason}</td><td>{point.source}</td><td>{point.approvedBy}</td></tr>)}</tbody></table></div> : <p className={styles.emptyState}>Todavía no hay overrides: el precio público sigue usando el fallback retail VINROS.</p>}
          </section>
        </>
      ) : null}

      <section className={localStyles.detailCard}>
        <h2>MATCH · {row.confidenceBand.toLocaleUpperCase("es-AR")} {Math.round(row.confidence * 100)}%</h2>
        <p>Método: {row.matchMethod.toLocaleUpperCase("es-AR")}{row.manualOverride ? " · OVERRIDE MANUAL" : ""}</p>
        {row.matchedFields.length ? <p>Coincidencias: {row.matchedFields.join(" · ")}</p> : null}
        {row.conflicts.length ? <p className={localStyles.error}>Conflictos: {row.conflicts.join(" · ")}</p> : null}
        <form action={setCompetitorMatchAction} className={localStyles.matchForm}>
          <input type="hidden" name="competitorProductId" value={row.id} />
          <label><span>SKU RUNIA SAFE</span><input name="runiaSku" defaultValue={text(row.runiaSku)} placeholder="Ej. VIN001" maxLength={80} /></label>
          <button name="matchAction" value="match" type="submit">GUARDAR MATCH</button>
          <button data-action="reject" name="matchAction" value="reject" type="submit">DEJAR SIN MATCH</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>HISTORIAL DE PRECIOS</h2><span>{detail.history.length}</span></div>
        <div className={localStyles.tableWrap}>
          <table className={localStyles.historyTable}>
            <thead><tr><th>FECHA</th><th>PRECIO</th><th>LISTA</th><th>PROMOCIÓN</th></tr></thead>
            <tbody>{detail.history.map((point) => <tr key={point.id}><td>{formatAdminDate(point.fetchedAt)}</td><td>{point.currentPrice ? formatCurrency(point.currentPrice) : "—"}</td><td>{point.listPrice ? formatCurrency(point.listPrice) : "—"}</td><td>{point.promotionText ?? "—"}</td></tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>HISTORIAL DE MATCH</h2><span>{detail.matchHistory.length}</span></div>
        <div className={localStyles.tableWrap}>
          <table className={localStyles.historyTable}>
            <thead><tr><th>FECHA</th><th>ANTES</th><th>DESPUÉS</th><th>CONFIDENCE</th><th>MOTIVO</th></tr></thead>
            <tbody>{detail.matchHistory.map((point) => <tr key={point.id}><td>{formatAdminDate(point.changedAt)}</td><td>{point.previousBand ?? "—"}</td><td>{point.band}</td><td>{Math.round(point.confidence * 100)}%</td><td>{point.reason}</td></tr>)}</tbody>
          </table>
        </div>
      </section>
    </>
  );
}
