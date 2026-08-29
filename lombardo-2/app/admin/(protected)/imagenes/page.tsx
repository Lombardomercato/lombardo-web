import Link from "next/link";
import { loadAdminImageCandidates } from "@/lib/server/admin/admin-data";
import type { MatchConfidenceBand, MatchReviewStatus } from "@/lib/server/admin/types";
import styles from "../../admin.module.css";
import { ImageCandidateQueue } from "./ImageCandidateQueue";

type Query = Record<string, string | string[] | undefined>;
const STATUSES: MatchReviewStatus[] = ["pending", "approved", "rejected"];
const CONFIDENCE_BANDS: MatchConfidenceBand[] = ["high", "medium", "low"];

function value(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] : "";
}

function pageHref(status: MatchReviewStatus, confidence?: MatchConfidenceBand, offset = 0) {
  const params = new URLSearchParams({ status });
  if (confidence) params.set("confidence", confidence);
  if (offset > 0) params.set("offset", String(offset));
  return `/admin/imagenes?${params}`;
}

export default async function AdminImageCandidatesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const requestedStatus = value(query, "status");
  const status = STATUSES.includes(requestedStatus as MatchReviewStatus)
    ? requestedStatus as MatchReviewStatus
    : "pending";
  const requestedConfidence = value(query, "confidence");
  const confidence = CONFIDENCE_BANDS.includes(requestedConfidence as MatchConfidenceBand)
    ? requestedConfidence as MatchConfidenceBand
    : undefined;
  const offset = /^\d+$/.test(value(query, "offset")) ? Number(value(query, "offset")) : 0;
  const page = await loadAdminImageCandidates({ status, confidenceBand: confidence, offset, limit: 25 });
  const success = value(query, "success");
  const error = value(query, "error");

  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>MATCHING · REVISIÓN HUMANA</p><h1>CANDIDATOS DE IMAGEN.</h1></div>
        <p>Compará producto, presentación e imagen. Aprobar es la acción explícita que registra y publica la imagen principal.</p>
      </header>
      {success ? <p className={styles.notice}>{success}</p> : null}
      {error ? <p className={styles.errorNotice}>{error}</p> : null}
      <nav className={styles.candidateTabs} aria-label="Estado de candidatos">
        <Link data-active={status === "pending"} href={pageHref("pending", confidence)}>PENDIENTES</Link>
        <Link data-active={status === "approved"} href={pageHref("approved", confidence)}>APROBADAS</Link>
        <Link data-active={status === "rejected"} href={pageHref("rejected", confidence)}>RECHAZADAS</Link>
      </nav>
      <nav className={styles.confidenceFilters} aria-label="Confianza de candidatos">
        <Link data-active={!confidence} href={pageHref(status)}>TODAS</Link>
        <Link data-active={confidence === "high"} href={pageHref(status, "high")}>HIGH</Link>
        <Link data-active={confidence === "medium"} href={pageHref(status, "medium")}>MEDIUM</Link>
        <Link data-active={confidence === "low"} href={pageHref(status, "low")}>LOW</Link>
      </nav>
      <p className={styles.readOnlyNotice}>SIN APROBACIÓN AUTOMÁTICA · “Seleccionar HIGH” nunca incluye MEDIUM · {page.total} candidatos en este filtro.</p>

      {page.candidates.length
        ? <ImageCandidateQueue candidates={page.candidates} status={status} confidence={confidence} />
        : <p className={styles.emptyState}>No hay candidatos en este estado y nivel de confianza.</p>}

      <nav className={styles.pagination} aria-label="Paginación de candidatos">
        {page.offset > 0 ? <Link className={styles.secondaryButton} href={pageHref(status, confidence, page.offset - page.limit)}>ANTERIOR</Link> : <span />}
        {page.hasMore ? <Link className={styles.secondaryButton} href={pageHref(status, confidence, page.offset + page.limit)}>SIGUIENTE</Link> : null}
      </nav>
    </>
  );
}
