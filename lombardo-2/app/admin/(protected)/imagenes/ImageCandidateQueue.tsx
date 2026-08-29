"use client";

import { useState } from "react";
import {
  bulkReviewImageCandidatesAction,
  publishImageCandidateAction,
} from "@/app/admin/actions";
import type { AdminImageCandidate, MatchConfidenceBand, MatchReviewStatus } from "@/lib/server/admin/types";
import styles from "../../admin.module.css";

const BULK_FORM_ID = "bulk-image-candidate-review";

interface Props {
  candidates: AdminImageCandidate[];
  status: MatchReviewStatus;
  confidence?: MatchConfidenceBand;
}

export function ImageCandidateQueue({ candidates, status, confidence }: Props) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const actionableCandidates = candidates.filter((candidate) =>
    status === "pending" || (status === "approved" && candidate.publicationStatus === "pending"));
  const actionableIds = new Set(actionableCandidates.map((candidate) => candidate.id));
  const highIds = actionableCandidates
    .filter((candidate) => candidate.confidenceBand === "high")
    .map((candidate) => candidate.id);

  function toggle(candidateId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(candidateId);
      else next.delete(candidateId);
      return next;
    });
  }

  function selectVisibleHigh() {
    // Deliberately replace the selection: MEDIUM is never included by this shortcut.
    setSelected(new Set(highIds));
  }

  return (
    <>
      {actionableCandidates.length ? (
        <section className={styles.bulkReviewBar} aria-label="Revisión masiva">
          <div>
            <strong>{selected.size} SELECCIONADOS</strong>
            <span>{status === "pending"
              ? "La aprobación descarga la imagen, registra la fuente y la publica como principal."
              : "Estos matches ya están aprobados. Publicar registra la fuente y actualiza catálogo y ficha."}</span>
          </div>
          <button className={styles.secondaryButton} type="button" onClick={selectVisibleHigh} disabled={!highIds.length}>
            SELECCIONAR HIGH VISIBLES ({highIds.length})
          </button>
          <button className={styles.secondaryButton} type="button" onClick={() => setSelected(new Set())} disabled={!selected.size}>
            LIMPIAR
          </button>
          <form id={BULK_FORM_ID} action={bulkReviewImageCandidatesAction}>
            <input type="hidden" name="returnStatus" value={status} />
            <input type="hidden" name="returnConfidence" value={confidence || ""} />
            <button className={styles.primaryButton} name="decision" value="approved" disabled={!selected.size}>
              {status === "pending" ? "APROBAR SELECCIONADOS" : "PUBLICAR SELECCIONADOS"}
            </button>
            <button className={styles.dangerButton} name="decision" value="rejected" disabled={!selected.size}>
              RECHAZAR SELECCIONADOS
            </button>
          </form>
        </section>
      ) : null}

      <div className={styles.candidateList}>
        {candidates.map((candidate) => (
          <article className={styles.candidateCard} key={candidate.id} data-selected={selected.has(candidate.id)}>
            <div className={styles.candidateSelection}>
              {actionableIds.has(candidate.id) ? (
                <label>
                  <input
                    form={BULK_FORM_ID}
                    type="checkbox"
                    name="candidateIds"
                    value={candidate.id}
                    checked={selected.has(candidate.id)}
                    onChange={(event) => toggle(candidate.id, event.currentTarget.checked)}
                  />
                  <span>SELECCIONAR</span>
                </label>
              ) : <span>{candidate.matchReviewStatus.toLocaleUpperCase("es-AR")}</span>}
              <span className={styles.confidenceBadge} data-band={candidate.confidenceBand}>
                {candidate.confidenceBand.toLocaleUpperCase("es-AR")} · {Math.round(candidate.confidence * 100)}%
              </span>
            </div>

            <div className={styles.externalPreview}>
              {/* Arbitrary reviewed sources cannot be allow-listed safely in next/image. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={candidate.imageUrl} alt={`Candidato ${candidate.source} para ${candidate.productName}`} loading="lazy" referrerPolicy="no-referrer" />
            </div>

            <div className={styles.candidateBody}>
              <div className={styles.candidateHeading}>
                <span>{candidate.category}</span>
                <span>FUENTE · {candidate.source.toLocaleUpperCase("es-AR")}</span>
              </div>
              <div className={styles.productComparison}>
                <section>
                  <p className={styles.sourceLabel}>PRODUCTO RUNIA</p>
                  <dl>
                    <div><dt>SKU</dt><dd>{candidate.sku}</dd></div>
                    <div><dt>NOMBRE</dt><dd>{candidate.productName}</dd></div>
                    <div><dt>PRESENTACIÓN</dt><dd>{candidate.presentation}</dd></div>
                  </dl>
                </section>
                <section>
                  <p className={styles.sourceLabel}>CANDIDATO {candidate.source.toLocaleUpperCase("es-AR")}</p>
                  <dl>
                    <div><dt>SKU</dt><dd>No informado</dd></div>
                    <div><dt>NOMBRE</dt><dd>{candidate.externalProductName}</dd></div>
                    <div><dt>PRESENTACIÓN</dt><dd>{candidate.externalPresentation}</dd></div>
                  </dl>
                </section>
              </div>
              <dl className={styles.matchEvidence}>
                <div><dt>MATCH</dt><dd>{candidate.evidence.length ? candidate.evidence.join(" · ") : "Sin evidencia estructurada"}</dd></div>
                {candidate.mismatchWarnings.length ? (
                  <div className={styles.matchWarning}><dt>REVISAR</dt><dd>{candidate.mismatchWarnings.join(" · ")}</dd></div>
                ) : null}
              </dl>
              <a className={styles.secondaryButton} href={candidate.sourceUrl} target="_blank" rel="noreferrer">ABRIR FUENTE ↗</a>
            </div>

            <div className={styles.candidateActions}>
              {status === "pending" ? (
                <form action={bulkReviewImageCandidatesAction}>
                  <input type="hidden" name="candidateIds" value={candidate.id} />
                  <input type="hidden" name="returnStatus" value={status} />
                  <input type="hidden" name="returnConfidence" value={confidence || ""} />
                  <button className={styles.primaryButton} name="decision" value="approved">APROBAR Y PUBLICAR</button>
                  <button className={styles.dangerButton} name="decision" value="rejected">RECHAZAR</button>
                </form>
              ) : null}
              {candidate.matchReviewStatus === "approved" && candidate.publicationStatus === "pending" ? (
                <form action={publishImageCandidateAction}>
                  <input type="hidden" name="candidateId" value={candidate.id} />
                  <button className={styles.primaryButton}>REINTENTAR PUBLICACIÓN</button>
                </form>
              ) : null}
              <small>DERECHOS: {candidate.rightsStatus.toLocaleUpperCase("es-AR")} · PUBLICACIÓN: {candidate.publicationStatus.toLocaleUpperCase("es-AR")}</small>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
