import Link from "next/link";
import {
  runCompetitorIngestionAction,
  removeLombardoOpportunityAction,
  scheduleLombardoOpportunityReviewAction,
  updateCompetitorAlertRulesAction,
  updatePricingIntelligenceSettingsAction,
} from "@/app/admin/actions";
import { COMPETITOR_CONFIDENCE_BANDS } from "@/lib/competitors/types";
import type { CompetitorCommercialObservation, MarketPosition } from "@/lib/competitors/types";
import { effectiveProductPrice } from "@/lib/competitors/pricing-intelligence";
import { formatAdminDate } from "@/lib/admin/presentation";
import { createCompetitorServices } from "@/lib/server/competitors";
import { createPricingIntelligenceServices } from "@/lib/server/pricing-intelligence";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../admin.module.css";
import localStyles from "./CompetitorDashboard.module.css";
import { PricingOpportunityActions } from "./PricingOpportunityActions";

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

const ECONOMIC_POSITION_LABELS: Record<MarketPosition, string> = {
  cheaper: "MÁS BARATO",
  in_market: "EN MERCADO",
  more_expensive: "MÁS CARO",
  insufficient_data: "SIN DATOS",
};

function stockLabel(observation: CompetitorCommercialObservation | undefined) {
  if (!observation) return "SIN DATO";
  if (observation.stockStatus === "in_stock") return "EN STOCK";
  if (observation.stockStatus === "out_of_stock") return "SIN STOCK";
  return "STOCK NO VERIFICADO";
}

function sourcePrice(observation: CompetitorCommercialObservation | undefined) {
  const price = observation ? effectiveProductPrice(observation) : undefined;
  return price ? formatCurrency(price) : "—";
}

export default async function CompetitorDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const query = await searchParams;
  const confidence = value(query, "confidence");
  const competitorStore = createCompetitorServices().store;
  const pricingStore = createPricingIntelligenceServices().store;
  const [dashboard, multi, pricing, published] = await Promise.all([
    competitorStore.dashboard({
      brand: value(query, "marca") || undefined,
      category: value(query, "categoria") || undefined,
      confidence: COMPETITOR_CONFIDENCE_BANDS.includes(confidence as never)
        ? confidence as (typeof COMPETITOR_CONFIDENCE_BANDS)[number]
        : undefined,
      minimumDifferencePct: numeric(query, "diferenciaMin"),
      maximumDifferencePct: numeric(query, "diferenciaMax"),
    }),
    competitorStore.multiCompetitorDashboard(),
    pricingStore.opportunities(),
    pricingStore.publishedOpportunities(),
  ]);
  const pricingSettings = pricing.settings;
  const publishedIds = new Set(published.filter((item) => item.opportunity).map((item) => item.productId));
  const suggestions = pricing.opportunities
    .filter((item) => !publishedIds.has(item.runiaProductId) && item.decisionStatus !== "ignored")
    .slice(0, 10);

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
        VINROS aporta costo y retail. Las señales externas ponderan precio, stock, pago, retiro, envío y confianza. Ninguna recomendación cambia precios sin aprobación humana.
      </p>

      <section className={localStyles.sourceGrid} aria-label="Fuentes competitivas activas">
        {multi.sources.map((source) => (
          <article className={localStyles.sourceCard} key={source.slug} data-priority={source.priority}>
            <span>{source.priority === "b2b" ? "TARIFARIO / B2B" : `PRIORIDAD ${source.priority.toLocaleUpperCase("es-AR")}`}</span>
            <strong>{source.name}</strong>
            <small>{source.priceSource.toLocaleUpperCase("es-AR")} · CHECKOUT {source.checkoutType.toLocaleUpperCase("es-AR")}</small>
          </article>
        ))}
      </section>

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

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>TOP 10 · COMPARACIÓN ECONÓMICA</h2><span>PRECIOS MODIFICADOS: 0</span></div>
        <p className={localStyles.sectionNote}>“—” indica un dato no verificado. Runia no estima stock, costos ni fletes faltantes.</p>
        <div className={localStyles.intelligenceList}>
          {multi.topTen.map((row) => {
            const positano = row.competitors.positano;
            const campos = row.competitors["vinoteca-campos"];
            const alVinoVino = row.competitors["al-vino-vino"];
            const vinosRosario = row.competitors["vinos-rosario"];
            return (
              <article className={localStyles.intelligenceCard} key={row.productKey}>
                <header>
                  <div><strong>{row.productName}</strong><small>{row.runiaSku ?? "SKU RUNIA NO RESUELTO"}</small></div>
                  <div><span>COSTO VINROS</span><strong>{row.vinrosCost ? formatCurrency(row.vinrosCost) : "—"}</strong></div>
                  <div><span>LOMBARDO</span><strong>{row.lombardoPrice ? formatCurrency(row.lombardoPrice) : "—"}</strong></div>
                </header>
                <div className={localStyles.competitorCells}>
                  <div>
                    <span>POSITANO</span><strong>{sourcePrice(positano)}</strong>
                    <small>{stockLabel(positano)} · {positano?.executable ? "EXECUTABLE" : "NO EJECUTABLE"}</small>
                    <small>Lista {positano?.listPrice ? formatCurrency(positano.listPrice) : "—"} · Transferencia {positano?.transferPrice ? formatCurrency(positano.transferPrice) : positano?.transferDiscountPct ? `-${positano.transferDiscountPct}% informado` : "—"}</small>
                    <small>Retiro {positano?.pickupCost === undefined ? "—" : formatCurrency(positano.pickupCost)} · Envío {positano?.deliveryCost === undefined ? "—" : formatCurrency(positano.deliveryCost)}</small>
                    <em data-signal={positano?.priceSignal ?? "invalid"}>{positano?.priceSignal.toLocaleUpperCase("es-AR") ?? "SIN SEÑAL"} · {Math.round((positano?.checkoutConfidence ?? 0) * 100)}%</em>
                  </div>
                  <div>
                    <span>CAMPOS</span><strong>{sourcePrice(campos)}</strong>
                    <small>{stockLabel(campos)}</small>
                    <small>{campos?.paymentConditions ?? "Transferencia no relevada"}</small>
                    <small>{campos?.availabilityTerms ?? "Condición no relevada"}</small>
                    <em data-signal={campos?.priceSignal ?? "invalid"}>{campos?.priceSignal.toLocaleUpperCase("es-AR") ?? "SIN SEÑAL"}</em>
                  </div>
                  <div>
                    <span>AL VINO VINO · TARIFF</span><strong>{alVinoVino?.unitPrice ? formatCurrency(alVinoVino.unitPrice) : "—"}</strong>
                    <small>{stockLabel(alVinoVino)} · Bulto {alVinoVino?.bulkPrice ? formatCurrency(alVinoVino.bulkPrice) : "—"}</small>
                    <small>{alVinoVino?.unitsPerBulk ? `${alVinoVino.unitsPerBulk} unidades` : "Unidades por bulto no verificadas"}</small>
                    <em data-signal={alVinoVino?.priceSignal ?? "invalid"}>{alVinoVino?.priceSignal.toLocaleUpperCase("es-AR") ?? "SIN SEÑAL"}</em>
                  </div>
                  <div>
                    <span>VINOS ROSARIO</span><strong>{sourcePrice(vinosRosario)}</strong>
                    <small>{stockLabel(vinosRosario)} · Envío {vinosRosario?.deliveryCost === undefined ? "—" : formatCurrency(vinosRosario.deliveryCost)}</small>
                    <small>{vinosRosario?.paymentConditions ?? "Condición no relevada"}</small>
                    <em data-signal={vinosRosario?.priceSignal ?? "invalid"}>{vinosRosario?.priceSignal.toLocaleUpperCase("es-AR") ?? "SIN SEÑAL"}</em>
                  </div>
                </div>
                <div className={localStyles.scenarioGrid}>
                  {Object.values(row.conclusions).map((conclusion) => (
                    <div key={conclusion.scenario} data-position={conclusion.position}>
                      <span>{conclusion.scenario.replaceAll("_", " ").toLocaleUpperCase("es-AR")}</span>
                      <strong>{ECONOMIC_POSITION_LABELS[conclusion.position]}</strong>
                      <small>{conclusion.marketReference ? `Mercado ${formatCurrency(conclusion.marketReference)} · ${conclusion.usableSignals} señales` : "Información insuficiente"}</small>
                    </div>
                  ))}
                </div>
                <p className={localStyles.recommendation}><strong>RECOMENDACIÓN:</strong> {row.recommendation}</p>
              </article>
            );
          })}
        </div>
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
        <div className={styles.sectionTitle}><h2>CATÁLOGO POSITANO · MATCHING</h2><span>{dashboard.rows.length}</span></div>
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
        <div className={styles.sectionTitle}><h2>OPORTUNIDADES PUBLICADAS</h2><span>{published.filter((item) => item.opportunity).length} ACTIVAS</span></div>
        <p className={localStyles.sectionNote}>Precio de referencia real + selling price auditado. Quitar el badge no restaura ni modifica el precio.</p>
        {published.length ? (
          <div className={localStyles.publishedGrid}>
            {published.map((item) => {
              const market = pricing.opportunities.find((candidate) => candidate.runiaProductId === item.productId);
              const marginAmount = item.supplierCost ? item.sellingPrice - item.supplierCost : undefined;
              const marginPct = marginAmount !== undefined ? marginAmount / item.sellingPrice * 100 : undefined;
              return (
                <article key={item.id} data-active={item.opportunity}>
                  <header><div><strong>{item.name}</strong><small>{item.sku}</small></div><span>{item.opportunity ? "PUBLICADA" : `INACTIVA · ${item.disabledReason ?? "REVISAR"}`}</span></header>
                  <dl>
                    <div><dt>PRECIO VINROS</dt><dd>{formatCurrency(item.supplierRetail)}</dd></div>
                    <div><dt>COSTO</dt><dd>{item.supplierCost ? formatCurrency(item.supplierCost) : "—"}</dd></div>
                    <div><dt>SELLING PRICE</dt><dd>{formatCurrency(item.sellingPrice)}</dd></div>
                    <div><dt>REFERENCE PRICE</dt><dd>{formatCurrency(item.referencePrice)}</dd></div>
                    <div><dt>MERCADO</dt><dd>{market ? formatCurrency(market.competitorPrice) : "—"}</dd></div>
                    <div><dt>MARGEN</dt><dd>{marginAmount !== undefined ? `${formatCurrency(marginAmount)} · ${percentage(marginPct)}` : "—"}</dd></div>
                    <div><dt>INICIO</dt><dd>{formatAdminDate(item.startAt)}</dd></div>
                    <div><dt>REVISIÓN</dt><dd>{formatAdminDate(item.reviewAt)}</dd></div>
                  </dl>
                  <div className={localStyles.publishedActions}>
                    {market ? <Link href={`/admin/competencia/${market.competitorProductId}#precio-manual`}>CAMBIAR PRECIO</Link> : null}
                    {item.opportunity ? <form action={removeLombardoOpportunityAction}><input type="hidden" name="runiaProductId" value={item.productId} /><button data-action="secondary" type="submit">QUITAR OPORTUNIDAD</button></form> : null}
                    <form action={scheduleLombardoOpportunityReviewAction}>
                      <input type="hidden" name="runiaProductId" value={item.productId} />
                      <label><span>PROGRAMAR REVISIÓN</span><input name="reviewAt" type="datetime-local" defaultValue={new Date(item.reviewAt).toISOString().slice(0, 16)} required /></label>
                      <button type="submit">GUARDAR</button>
                    </form>
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className={styles.emptyState}>Todavía no hay oportunidades publicadas.</p>}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>OPORTUNIDADES SUGERIDAS</h2><span>AUTO-PUBLISH: NO</span></div>
        <p className={localStyles.sectionNote}>Ordenadas por impacto comercial, brecha de mercado, margen posible y confianza. Cada publicación requiere aprobación humana.</p>
        <div className={localStyles.suggestionList}>
          {suggestions.map((item) => (
            <article key={item.competitorProductId}>
              <div><strong>{item.runiaName}</strong><small>{item.runiaSku} · IMPACTO {item.impactScore.toLocaleString("es-AR", { maximumFractionDigits: 1 })}</small></div>
              <div><span>LOMBARDO</span><strong>{formatCurrency(item.lombardoSellingPrice)}</strong></div>
              <div><span>MERCADO</span><strong>{formatCurrency(item.competitorPrice)}</strong></div>
              <div><span>MARGEN</span><strong>{item.currentMargin ? percentage(item.currentMargin.percentage) : "—"}</strong></div>
              <PricingOpportunityActions opportunity={item} compact />
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionTitle}><h2>CONFIGURACIÓN DE PRICING</h2><span>UMBRAL HUMANO · V1</span></div>
        <form action={updatePricingIntelligenceSettingsAction} className={localStyles.pricingSettings}>
          <label><span>MUY COMP. HASTA %</span><input name="veryCompetitiveMaxPct" type="number" step="0.1" defaultValue={pricingSettings.veryCompetitiveMaxPct} /></label>
          <label><span>COMPETITIVO HASTA %</span><input name="competitiveMaxPct" type="number" step="0.1" defaultValue={pricingSettings.competitiveMaxPct} /></label>
          <label><span>EN MERCADO HASTA %</span><input name="marketMaxPct" type="number" step="0.1" defaultValue={pricingSettings.marketMaxPct} /></label>
          <label><span>CARO HASTA %</span><input name="expensiveMaxPct" type="number" step="0.1" defaultValue={pricingSettings.expensiveMaxPct} /></label>
          <label><span>MARGEN MÍNIMO %</span><input name="minimumMarginPct" type="number" min="0" max="95" step="0.1" defaultValue={pricingSettings.minimumMarginPct} /></label>
          <label><span>TARGET MARGIN %</span><input name="targetMarginPct" type="number" min="0" max="95" step="0.1" defaultValue={pricingSettings.targetMarginPct} /></label>
          <label><span>VIGENCIA COMP. HORAS</span><input name="competitorMaxAgeHours" type="number" min="1" max="720" defaultValue={pricingSettings.competitorMaxAgeHours} /></label>
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
