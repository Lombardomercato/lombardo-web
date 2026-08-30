import Link from "next/link";
import { notFound } from "next/navigation";
import { setCompetitorMatchAction } from "@/app/admin/actions";
import { formatAdminDate } from "@/lib/admin/presentation";
import { createCompetitorServices } from "@/lib/server/competitors";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../../admin.module.css";
import localStyles from "../CompetitorDashboard.module.css";

function text(value: string | undefined) {
  return value ?? "";
}

function percentage(value: number | undefined) {
  if (value === undefined) return "—";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}%`;
}

export default async function CompetitorProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [{ id }, feedback] = await Promise.all([params, searchParams]);
  const detail = await createCompetitorServices().store.productDetail(id);
  if (!detail) notFound();
  const row = detail.row;

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
          <h2>LOMBARDO RETAIL</h2>
          <strong className={localStyles.priceHero}>{row.lombardoRetailPrice ? formatCurrency(row.lombardoRetailPrice) : "SIN MATCH"}</strong>
          <dl className={localStyles.facts}>
            <div><dt>Diferencia $</dt><dd>{row.differenceAmount === undefined ? "—" : formatCurrency(row.differenceAmount)}</dd></div>
            <div><dt>Diferencia %</dt><dd>{percentage(row.differencePct)}</dd></div>
            <div><dt>Producto Runia</dt><dd>{row.runiaName ?? "—"}</dd></div>
            <div><dt>SKU</dt><dd>{row.runiaSku ?? "—"}</dd></div>
          </dl>
        </article>
      </section>

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
