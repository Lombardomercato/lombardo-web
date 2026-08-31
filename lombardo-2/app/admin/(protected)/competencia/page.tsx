import Link from "next/link";
import {
  runCompetitorIngestionAction,
  updateCompetitorAlertRulesAction,
  updatePricingIntelligenceSettingsAction,
} from "@/app/admin/actions";
import { COMPETITOR_CONFIDENCE_BANDS } from "@/lib/competitors/types";
import { formatAdminDate } from "@/lib/admin/presentation";
import { createCompetitorServices } from "@/lib/server/competitors";
import { createPricingIntelligenceServices } from "@/lib/server/pricing-intelligence";
import { formatCurrency } from "@/lib/utils/format-currency";
import { PricingOpportunityActions } from "./PricingOpportunityActions";
import styles from "../../admin.module.css";
import localStyles from "./CompetitorDashboard.module.css";

export const maxDuration = 300;

type Query = Record<string, string | string[] | undefined>;

function value(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] as string : "";
}

function numeric(query: Query, key: string) {
  const raw = value(query, key);
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function percentage(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

const RULE_LABELS = {
  lombardo_more_expensive: "Lombardo > umbral más caro",
  competitor_price_change: "Competidor cambia > umbral",
  match_lost: "Producto pierde el match",
} as const;

const POSITION_LABELS = {
  very_competitive: "MUY COMPETITIVO",
  competitive: "COMPETITIVO",
  in_market: "EN MERCADO",
  expensive: "CARO",
  very_expensive: "MUY CARO",
} as const;

const SCENARIO_LABELS = {
  match_competitor: "IGUALAR COMPETIDOR",
  competitor_plus_5: "COMPETIDOR +5%",
  competitor_minus_5: "COMPETIDOR -5%",
  target_margin: "TARGET MARGIN",
} as const;

export default async function CompetitorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const confidence = value(query, "confidence");
  const [dashboard, pricing] = await Promise.all([
    createCompetitorServices().store.dashboard({
      brand: value(query, "marca") || undefined,
      category: value(query, "categoria") || undefined,
      confidence: COMPETITOR_CONFIDENCE_BANDS.includes(confidence as never)
        ? confidence as (typeof COMPETITOR_CONFIDENCE_BANDS)[number]
        : undefined,
      minimumDifferencePct: numeric(query, "diferenciaMin"),
      maximumDifferencePct: numeric(query, "diferenciaMax"),
    }),
    createPricingIntelligenceServices().store.opportunities(),
  ]);
  const filteredRuniaProducts = new Set(
    dashboard.rows.map((row) => row.runiaProductId).filter(Boolean),
  );
  const pricingRows = pricing.opportunities.filter((row) => {
    if (row.decisionStatus === "ignored") return false;
    return filteredRuniaProducts.has(row.runiaProductId);
  });

  const metrics = [
    ["CATÁLOGO POSITANO", dashboard.metrics.total, ""],
    ["MATCHED", dashboard.metrics.matched, "good"],
    ["LOMBARDO MÁS BARATO", dashboard.metrics.lombardoCheaper, "good"],
    ["IGUAL", dashboard.metrics.equal, ""],
    ["LOMBARDO MÁS CARO", dashboard.metrics.lombardoMoreExpensive, "danger"],
    ["HIGH", dashboard.metrics.high, "good"],
    ["MEDIUM", dashboard.metrics.medium, ""],
    ["LOW", dashboard.metrics.low, ""],
    ["NO MATCH", dashboard.metrics.noMatch, "danger"],
    ["CAMBIOS RECIENTES", dashboard.metrics.recentChanges, ""],
  ] as const;

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>RUNIA · SEÑALES EXTERNAS</p>
          <h1>COMPETENCIA.</h1>
        </div>
        <div className={localStyles.headerActions}>
          <form action={runCompetitorIngestionAction}>
            <button type="submit">ACTUALIZAR POSITANO</button>
          </form>
          <small>Lectura pública, sin cambios automáticos de precio.</small>
        </div>
      </header>

      {value(query, "success") ? <p className={localStyles.feedback} role="status">{value(query, "success")}</p> : null}
      {value(query, "error") ? <p className={localStyles.error} role="alert">{value(query, "error")}</p> : null}
      <p className={localStyles.notice}>
        VINROS aporta costo y retail. Lombardo decide su selling price en una capa separada. Ninguna recomendación cambia precios sin aprobación humana.
      </p>

      <section className={localStyles.runStatus} data-state={dashboard.competitor.circuitState} data-status={dashboard.latestRun?.status}>
        <div>
          <span>POSITANO INGESTION</span>
          <strong>{dashboard.latestRun?.status.toLocaleUpperCase("es-AR") ?? "SIN EJECUTAR"}</strong>
          {dashboard.competitor.circuitReason ? <p>{dashboard.competitor.circuitReason}</p> : null}
        </div>
        <div>
          <span>ÚLTIMA CORRIDA</span>
          <strong>{dashboard.latestRun?.finishedAt ? formatAdminDate(dashboard.latestRun.finishedAt) : "—"}</strong>
          <small>{dashboard.latestRun ? `${dashboard.latestRun.pagesFetched} páginas · ${dashboard.latestRun.productsParsed} productos` : "Piloto pendiente"}</small>
        </div>
      </section>

      <section className={localStyles.metricGrid} aria-label="Resumen competitivo">
        {metrics.map(([label, amount, tone]) => (
          <article className={localStyles.metric} data-tone={tone} key={label}>
            <span>{label}</span>
            <strong>{amount.toLocaleString("es-AR")}</strong>
          </article>
        ))}
      </section>

      <form className={localStyles.filters}>
        <label><span>DIFERENCIA MÍN. %</span><input name="diferenciaMin" type="number" step="0.1" defaultValue={value(query, "diferenciaMin")} /></label>
        <label><span>DIFERENCIA MÁX. %</span><input name="diferenciaMax" type="number" step="0.1" defaultValue={value(query, "diferenciaMax")} /></label>
        <label><span>MARCA</span><select name="marca" defaultValue={value(query, "marca")}><option value="">TODAS</option>{dashboard.brands.map((brand) => <option key={brand}>{brand}</option>)}</select></label>
        <label><span>CATEGORÍA</span><select name="categoria" defaultValue={value(query, "categoria")}><option value="">TODAS</option>{dashboard.categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label><span>CONFIDENCE</span><select name="confidence" defaultValue={confidence}><option value="">TODOS</option>{COMPETITOR_CONFIDENCE_BANDS.map((band) => <option key={band} value={band}>{band.toLocaleUpperCase("es-AR")}</option>)}</select></label>
        <button type="submit">FILTRAR</button>
      </form>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>OPORTUNIDADES DE PRECIO</h2><span>{pricingRows.length} COMPARABLES · ORDEN IMPACTO</span></div>
        <p className={localStyles.sectionNote}>Impacto = brecha positiva en pesos × confidence. Si falta costo, no se calcula margen ni se habilita aprobación.</p>
        {pricingRows.length ? (
          <div className={localStyles.tableWrap}>
            <div className={localStyles.pricingTable}>
              <div className={localStyles.pricingHeader}><span>PRODUCTO</span><span>POSICIÓN</span><span>LOMBARDO</span><span>COMPETIDOR</span><span>DIF.</span><span>COSTO</span><span>MARGEN ACTUAL</span><span>SUGERIDO</span><span>MARGEN SUG.</span><span>ACCIONES</span></div>
              {pricingRows.slice(0, 100).map((row) => (
                <article className={localStyles.pricingRow} data-status={row.decisionStatus} key={row.competitorProductId}>
                  <div className={localStyles.productName}><strong>{row.runiaName}</strong><small>{row.runiaSku} · {row.confidenceBand.toLocaleUpperCase("es-AR")} {Math.round(row.matchConfidence * 100)}%</small></div>
                  <span className={localStyles.position} data-position={row.position}>{POSITION_LABELS[row.position]}</span>
                  <div className={localStyles.price}><strong>{formatCurrency(row.lombardoSellingPrice)}</strong><small>VINROS retail {formatCurrency(row.supplierRetail)} · {row.sellingPriceSource === "LOMBARDO_SELLING_PRICE" ? "SELLING PRICE" : "FALLBACK"}</small></div>
                  <div className={localStyles.price}><strong>{formatCurrency(row.competitorPrice)}</strong><small>{row.competitorName}</small></div>
                  <div className={localStyles.price}><strong>{formatCurrency(row.differenceAmount)}</strong><small>{percentage(row.differencePct)}</small></div>
                  <div className={localStyles.price}><strong>{row.supplierCost ? formatCurrency(row.supplierCost) : "SIN COSTO"}</strong><small>VINROS</small></div>
                  <div className={localStyles.price}><strong>{row.currentMargin ? percentage(row.currentMargin.percentage) : "NO CALCULABLE"}</strong><small>{row.currentMargin ? `${formatCurrency(row.currentMargin.amount)} · markup ${percentage(row.currentMargin.markupPercentage)}` : "No se inventa margen"}</small></div>
                  <div className={localStyles.price}><strong>{row.recommendation?.price ? formatCurrency(row.recommendation.price) : "SIN SUGERENCIA"}</strong><small>{row.recommendation ? SCENARIO_LABELS[row.recommendation.type] : "Guardrail activo"}</small></div>
                  <div className={localStyles.price}><strong>{row.recommendation?.margin ? percentage(row.recommendation.margin.percentage) : "—"}</strong><small>{row.recommendation?.margin ? formatCurrency(row.recommendation.margin.amount) : "—"}</small></div>
                  <PricingOpportunityActions opportunity={row} compact />
                </article>
              ))}
            </div>
          </div>
        ) : <p className={styles.emptyState}>No hay oportunidades para estos filtros.</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>PRECIO LOMBARDO VS POSITANO</h2><span>{dashboard.rows.length}</span></div>
        {dashboard.rows.length ? (
          <div className={localStyles.tableWrap}>
            <div className={localStyles.table}>
              <div className={localStyles.tableHeader}><span>PRODUCTO</span><span>POSITANO</span><span>LOMBARDO</span><span>DIF.</span><span>MATCH</span><span>DETALLE</span></div>
              {dashboard.rows.map((row) => {
                const direction = row.differencePct === undefined || Math.abs(row.differencePct) <= 0.5
                  ? "equal" : row.differencePct > 0 ? "more" : "less";
                return (
                  <article className={localStyles.row} key={row.id}>
                    <div className={localStyles.productName}><strong>{row.externalName}</strong><small>{row.brand} · {row.category}</small></div>
                    <div className={localStyles.price}><strong>{row.currentPrice ? formatCurrency(row.currentPrice) : "SIN PRECIO"}</strong><small>{row.promotionText ?? (row.listPrice ? `Lista ${formatCurrency(row.listPrice)}` : "Sin promo")}</small></div>
                    <div className={localStyles.price}><strong>{row.lombardoRetailPrice ? formatCurrency(row.lombardoRetailPrice) : "—"}</strong><small>{row.runiaSku ?? "Sin match"}</small></div>
                    <span className={localStyles.delta} data-direction={direction}>{percentage(row.differencePct)}</span>
                    <span className={localStyles.confidence} data-band={row.confidenceBand}>{row.confidenceBand.toLocaleUpperCase("es-AR")} · {Math.round(row.confidence * 100)}%</span>
                    <Link className={localStyles.detailLink} href={`/admin/competencia/${row.id}`}>REVISAR</Link>
                  </article>
                );
              })}
            </div>
          </div>
        ) : <p className={styles.emptyState}>No hay comparaciones para estos filtros.</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>CONFIGURACIÓN DE PRICING</h2><span>UMBRAL HUMANO · V1</span></div>
        <form action={updatePricingIntelligenceSettingsAction} className={localStyles.pricingSettings}>
          <label><span>MUY COMP. HASTA %</span><input name="veryCompetitiveMaxPct" type="number" step="0.1" defaultValue={pricing.settings.veryCompetitiveMaxPct} /></label>
          <label><span>COMPETITIVO HASTA %</span><input name="competitiveMaxPct" type="number" step="0.1" defaultValue={pricing.settings.competitiveMaxPct} /></label>
          <label><span>EN MERCADO HASTA %</span><input name="marketMaxPct" type="number" step="0.1" defaultValue={pricing.settings.marketMaxPct} /></label>
          <label><span>CARO HASTA %</span><input name="expensiveMaxPct" type="number" step="0.1" defaultValue={pricing.settings.expensiveMaxPct} /></label>
          <label><span>MARGEN MÍNIMO %</span><input name="minimumMarginPct" type="number" min="0" max="95" step="0.1" defaultValue={pricing.settings.minimumMarginPct} /></label>
          <label><span>TARGET MARGIN %</span><input name="targetMarginPct" type="number" min="0" max="95" step="0.1" defaultValue={pricing.settings.targetMarginPct} /></label>
          <label><span>VIGENCIA COMP. HORAS</span><input name="competitorMaxAgeHours" type="number" min="1" max="720" defaultValue={pricing.settings.competitorMaxAgeHours} /></label>
          <button type="submit">GUARDAR UMBRALES</button>
        </form>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>ALERTAS IMPORTANTES</h2><span>RESEND · SIN SPAM</span></div>
        <form action={updateCompetitorAlertRulesAction} className={localStyles.rules}>
          {dashboard.rules.map((rule) => (
            <div className={localStyles.rule} key={rule.id}>
              <label><input name={`enabled_${rule.type}`} type="checkbox" defaultChecked={rule.enabled} /><strong>{RULE_LABELS[rule.type]}</strong></label>
              <label><span>UMBRAL %</span><input name={`threshold_${rule.type}`} type="number" min="0" max="1000" step="0.1" defaultValue={rule.thresholdPct} /></label>
              <label><span>COOLDOWN HORAS</span><input name={`cooldown_${rule.type}`} type="number" min="1" max="8760" defaultValue={rule.cooldownHours} /></label>
              <span />
            </div>
          ))}
          <button type="submit">GUARDAR ALERTAS</button>
        </form>
      </section>
    </>
  );
}
