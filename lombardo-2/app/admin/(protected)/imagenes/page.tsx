import Link from "next/link";
import { reviewImageCandidateAction } from "@/app/admin/actions";
import { loadAdminImageCandidates } from "@/lib/server/admin/admin-data";
import type { MatchReviewStatus } from "@/lib/server/admin/types";
import styles from "../../admin.module.css";

type Query = Record<string, string | string[] | undefined>;
const STATUSES: MatchReviewStatus[] = ["pending", "approved", "rejected"];

function value(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] : "";
}

function pageHref(status: MatchReviewStatus, offset = 0) {
  const params = new URLSearchParams({ status });
  if (offset > 0) params.set("offset", String(offset));
  return `/admin/imagenes?${params}`;
}

export default async function AdminImageCandidatesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const requestedStatus = value(query, "status");
  const status = STATUSES.includes(requestedStatus as MatchReviewStatus)
    ? requestedStatus as MatchReviewStatus
    : "pending";
  const offset = /^\d+$/.test(value(query, "offset")) ? Number(value(query, "offset")) : 0;
  const page = await loadAdminImageCandidates({ status, offset, limit: 25 });
  const success = value(query, "success");
  const error = value(query, "error");

  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>PILOTO · MATCHING HUMANO</p><h1>CANDIDATOS DE IMAGEN.</h1></div>
        <p>Compará identidad, variedad, presentación y formato antes de aprobar el match. Aprobar no publica la imagen.</p>
      </header>
      {success ? <p className={styles.notice}>{success}</p> : null}
      {error ? <p className={styles.errorNotice}>{error}</p> : null}
      <nav className={styles.candidateTabs} aria-label="Estado de candidatos">
        <Link data-active={status === "pending"} href={pageHref("pending")}>PENDIENTES</Link>
        <Link data-active={status === "approved"} href={pageHref("approved")}>MATCH APROBADO</Link>
        <Link data-active={status === "rejected"} href={pageHref("rejected")}>RECHAZADOS</Link>
      </nav>
      <p className={styles.readOnlyNotice}>PUBLICACIÓN EXTERNA = 0 · Los candidatos conservan derechos “desconocidos” y nunca entran a la vista pública.</p>

      {page.candidates.length ? <div className={styles.candidateList}>
        {page.candidates.map((candidate) => <article className={styles.candidateCard} key={candidate.id}>
          <div className={styles.externalPreview}>
            {/* External previews are intentionally not proxied or published by Next Image. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={candidate.imageUrl} alt={`Candidato externo para ${candidate.productName}`} loading="lazy" referrerPolicy="no-referrer" />
          </div>
          <div className={styles.candidateBody}>
            <div className={styles.candidateHeading}>
              <span className={styles.confidenceBadge} data-band={candidate.confidenceBand}>{candidate.confidenceBand.toLocaleUpperCase("es-AR")} · {Math.round(candidate.confidence * 100)}%</span>
              <span>{candidate.category}</span>
            </div>
            <p className={styles.sourceLabel}>RUNIA · {candidate.sku} · {candidate.presentation}</p>
            <h2>{candidate.productName}</h2>
            <p className={styles.externalName}><strong>EXTERNO:</strong> {candidate.externalProductName}</p>
            <dl className={styles.matchEvidence}>
              <div><dt>FUENTE</dt><dd>{candidate.source}</dd></div>
              <div><dt>MATCH</dt><dd>{candidate.evidence.length ? candidate.evidence.join(" · ") : "Sin evidencia estructurada"}</dd></div>
              {candidate.mismatchWarnings.length ? <div className={styles.matchWarning}><dt>REVISAR</dt><dd>{candidate.mismatchWarnings.join(" · ")}</dd></div> : null}
            </dl>
            <a className={styles.secondaryButton} href={candidate.sourceUrl} target="_blank" rel="noreferrer">ABRIR FUENTE ↗</a>
          </div>
          <div className={styles.candidateActions}>
            <form action={reviewImageCandidateAction}>
              <input type="hidden" name="candidateId" value={candidate.id} />
              <input type="hidden" name="returnStatus" value={status} />
              <button className={styles.primaryButton} name="decision" value="approved" disabled={candidate.matchReviewStatus === "approved"}>APROBAR MATCH</button>
              <button className={styles.dangerButton} name="decision" value="rejected" disabled={candidate.matchReviewStatus === "rejected"}>RECHAZAR</button>
            </form>
            <small>DERECHOS: {candidate.rightsStatus.toLocaleUpperCase("es-AR")} · PUBLICACIÓN: {candidate.publicationStatus.toLocaleUpperCase("es-AR")}</small>
          </div>
        </article>)}
      </div> : <p className={styles.emptyState}>No hay candidatos en este estado.</p>}

      <nav className={styles.pagination} aria-label="Paginación de candidatos">
        {page.offset > 0 ? <Link className={styles.secondaryButton} href={pageHref(status, page.offset - page.limit)}>ANTERIOR</Link> : <span />}
        {page.hasMore ? <Link className={styles.secondaryButton} href={pageHref(status, page.offset + page.limit)}>SIGUIENTE</Link> : null}
      </nav>
    </>
  );
}
