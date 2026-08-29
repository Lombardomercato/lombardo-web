"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  SecretCellarAttemptResult,
  SecretCellarCandidate,
  SecretCellarPublicExperience,
} from "@/lib/secret-cellar/types";
import {
  selectActiveBottle,
  toggleDiscardedBottle,
} from "@/lib/secret-cellar/game-state";
import styles from "./SecretCellarGame.module.css";

function CandidateArtwork({ candidate }: { candidate: SecretCellarCandidate }) {
  return candidate.imageUrl ? (
    <Image
      src={candidate.imageUrl}
      alt={`Botella de ${candidate.name}`}
      fill
      sizes="(max-width: 480px) 72vw, (max-width: 900px) 31vw, 18vw"
    />
  ) : (
    <span className={styles.fallbackBottle} aria-hidden="true">
      {candidate.brand.slice(0, 2)}
    </span>
  );
}

export function SecretCellarGame({
  experience,
}: {
  experience: SecretCellarPublicExperience;
}) {
  const challenge = experience.challenge;
  const [clueIndex, setClueIndex] = useState(0);
  const [discarded, setDiscarded] = useState<Set<string>>(() => new Set());
  const [answering, setAnswering] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [lockedSelectionId, setLockedSelectionId] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [contactKind, setContactKind] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [result, setResult] = useState<SecretCellarAttemptResult | null>(null);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  const selected = useMemo(
    () => challenge?.candidates.find((candidate) => candidate.id === selectedId),
    [challenge, selectedId],
  );
  const selectionLocked = Boolean(lockedSelectionId);

  if (!experience.enabled || !challenge) {
    return (
      <section className={styles.closed}>
        <p>LA CAVA SECRETA · LOMBARDO.</p>
        <h1>LA PUERTA ESTÁ CERRADA.</h1>
        <p>Estamos guardando la próxima botella. Volvé en un rato.</p>
        <Link href="/">VOLVER A LOMBARDO →</Link>
      </section>
    );
  }

  const toggleDiscard = (candidateId: string) => {
    if (selectionLocked) return;
    setDiscarded((current) => toggleDiscardedBottle(current, candidateId));
    if (selectedId === candidateId) setSelectedId("");
  };

  const submitAttempt = async () => {
    const answerId = lockedSelectionId || selectedId;
    if (!answerId || submitting) return;
    if (!challenge.playerIsAuthenticated && !identifying) {
      setIdentifying(true);
      return;
    }

    setLockedSelectionId(answerId);
    setSubmitting(true);
    setRevealing(true);
    setError("");
    const revealStartedAt = performance.now();
    try {
      const response = await fetch("/api/cava-secreta/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          selectedProductId: answerId,
          guestContactKind: challenge.playerIsAuthenticated ? undefined : contactKind,
          guestContact: challenge.playerIsAuthenticated ? undefined : contact,
        }),
      });
      const payload = (await response.json()) as SecretCellarAttemptResult & { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pudimos comprobar la botella.");
      const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const remainingRevealTime = (prefersReducedMotion ? 0 : 1_450) - (performance.now() - revealStartedAt);
      if (remainingRevealTime > 0) {
        await new Promise((resolve) => window.setTimeout(resolve, remainingRevealTime));
      }
      setResult(payload);
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" }));
      setIdentifying(false);
    } catch (attemptError) {
      setError(attemptError instanceof Error ? attemptError.message : "No pudimos comprobar la botella.");
    } finally {
      setRevealing(false);
      setSubmitting(false);
    }
  };

  const share = async () => {
    const data = {
      title: "La Cava Secreta · Lombardo",
      text: "Encontré la botella secreta de Lombardo.",
      url: `${window.location.origin}/cava-secreta`,
    };
    try {
      if (navigator.share) await navigator.share(data);
      else await navigator.clipboard.writeText(`${data.text} ${data.url}`);
      setShared(true);
    } catch {
      setShared(false);
    }
  };

  if (result) {
    const found = result.result === "FOUND";
    return (
      <section className={styles.reveal} data-found={found}>
        <div className={styles.revealCopy}>
          <p>{found ? "DESCUBIERTA." : "CASI."}</p>
          <h1>{found ? "LA ENCONTRASTE." : "LA BOTELLA ERA ESTA."}</h1>
          <p>
            {found
              ? `La botella estaba ahí. Tenés ${challenge.rewardPercentage}% OFF para llevártela durante ${challenge.rewardValidHours} horas.`
              : "Hoy se escondió mejor. Mañana hay otra."}
          </p>
        </div>
        <article className={styles.secretBottle}>
          <div><CandidateArtwork candidate={result.secret} /></div>
          <span>{found ? "LA BOTELLA DESCUBIERTA" : "LA BOTELLA DE HOY"}</span>
          <h2>{result.secret.name}</h2>
          <p>{result.secret.brand} · {result.secret.presentation}</p>
        </article>
        <div className={styles.revealDetails}>
          {result.couponCode ? (
            <div className={styles.coupon}>
              <span>TU CÓDIGO</span>
              <strong>{result.couponCode}</strong>
              <small>{challenge.rewardPercentage}% OFF · 1 USO · RETAIL · {challenge.rewardValidHours} HORAS · NO ACUMULABLE</small>
            </div>
          ) : null}
          <div className={styles.revealActions}>
            <Link href={`/productos/${result.secret.slug}`}>VER PRODUCTO →</Link>
            {found ? (
              <button type="button" onClick={share}>
                {shared ? "LINK COPIADO" : "COMPARTIR"}
              </button>
            ) : (
              <Link className={styles.returnTomorrow} href="/">VOLVER MAÑANA</Link>
            )}
          </div>
        </div>
      </section>
    );
  }

  const finalClue = clueIndex >= challenge.clues.length - 1;
  const activeCount = challenge.candidates.length - discarded.size;

  return (
    <section className={styles.game} aria-busy={revealing}>
      <header className={styles.intro}>
        <div className={styles.introTitle}>
          <p><span>04</span> EXPERIENCIA LOMBARDO</p>
          <h1>LA CAVA<br /><em>SECRETA.</em></h1>
        </div>
        <div className={styles.brief}>
          <strong>HAY UNA BOTELLA ESCONDIDA.</strong>
          <span>ENCONTRALA.</span>
          <p>Seguí las pistas. Apartá sospechosas. Recuperalas si cambiás de idea. Una respuesta por día.</p>
        </div>
      </header>

      <div className={styles.cluePanel} aria-live="polite">
        <span>PISTA {String(clueIndex + 1).padStart(2, "0")}</span>
        <p>{challenge.clues[clueIndex]?.text}</p>
        <small>{clueIndex + 1} / {challenge.clues.length}</small>
      </div>

      <div className={styles.boardHeader}>
        <div>
          <p>{answering ? "ELEGÍ UNA BOTELLA ACTIVA. PODÉS CAMBIARLA ANTES DE CONFIRMAR." : "TOCÁ UNA BOTELLA PARA DESCARTARLA O RECUPERARLA."}</p>
          <small>{answering ? "MODO RESPUESTA" : "MODO DESCARTE"}</small>
        </div>
        <span>{String(activeCount).padStart(2, "0")} ACTIVAS</span>
      </div>

      <div className={styles.candidateGrid} role="list" aria-label="Botellas candidatas">
        {challenge.candidates.map((candidate, index) => {
          const isDiscarded = discarded.has(candidate.id);
          const isSelected = selectedId === candidate.id;
          const actionLabel = isDiscarded
            ? `Recuperar ${candidate.name}`
            : answering
              ? `Elegir ${candidate.name} como respuesta`
              : `Descartar ${candidate.name}`;
          return (
            <article
              className={styles.candidate}
              data-discarded={isDiscarded}
              data-selected={isSelected}
              key={candidate.id}
              role="listitem"
            >
              <span className={styles.candidateNumber}>{String(index + 1).padStart(2, "0")}</span>
              <button
                className={styles.candidateAction}
                type="button"
                aria-label={actionLabel}
                aria-pressed={isDiscarded || isSelected}
                disabled={selectionLocked}
                onClick={() => {
                  if (isDiscarded || !answering) toggleDiscard(candidate.id);
                  else setSelectedId(selectActiveBottle(discarded, candidate.id));
                }}
              >
                <span className={styles.candidateImage}><CandidateArtwork candidate={candidate} /></span>
                <span className={styles.stateMark} aria-hidden="true">
                  {isDiscarded ? "DESCARTADA ↩" : isSelected ? "TU RESPUESTA ✓" : answering ? "ELEGIR ESTA →" : "DESCARTAR ×"}
                </span>
                <strong>{candidate.name}</strong>
                <small>{candidate.brand} · {candidate.presentation}</small>
              </button>
            </article>
          );
        })}
      </div>

      <div className={styles.decisionBar}>
        {answering ? (
          <>
            <div>
              <span>{selected ? "BOTELLA ELEGIDA" : "TU RESPUESTA"}</span>
              <strong>{selected?.name ?? "Elegí una botella activa"}</strong>
            </div>
            <div className={styles.decisionActions}>
              <button
                className={styles.secondaryDecision}
                type="button"
                disabled={selectionLocked}
                onClick={() => { setAnswering(false); setSelectedId(""); }}
              >
                SEGUIR MIRANDO
              </button>
              <button type="button" disabled={!selectedId || selectionLocked} onClick={submitAttempt}>
                ESTA ES LA BOTELLA →
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <span>{finalClue ? "TODAS LAS PISTAS ABIERTAS" : "SEGUÍ INVESTIGANDO"}</span>
              <strong>{activeCount} botellas siguen en la cava</strong>
            </div>
            <div className={styles.decisionActions}>
              {!finalClue ? (
                <button type="button" onClick={() => setClueIndex((current) => current + 1)}>
                  ABRIR PISTA {String(clueIndex + 2).padStart(2, "0")} →
                </button>
              ) : null}
              <button className={styles.answerDecision} type="button" disabled={activeCount === 0} onClick={() => setAnswering(true)}>
                YA SÉ CUÁL ES
              </button>
            </div>
          </>
        )}
      </div>

      {revealing && selected ? (
        <div className={styles.revealTransition} role="status" aria-live="polite">
          <div className={styles.revealFocus}>
            <span>LA BOTELLA ELEGIDA</span>
            <div className={styles.revealFocusImage}><CandidateArtwork candidate={selected} /></div>
            <strong>{selected.name}</strong>
            <small>ABRIENDO LA CAVA…</small>
          </div>
        </div>
      ) : null}

      {identifying ? (
        <div className={styles.identityBackdrop}>
          <form
            className={styles.identityCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="secret-cellar-identity-title"
            onSubmit={(event) => { event.preventDefault(); void submitAttempt(); }}
          >
            {!selectionLocked ? (
              <button className={styles.closeIdentity} type="button" onClick={() => setIdentifying(false)} aria-label="Cerrar">×</button>
            ) : null}
            <p>ANTES DE ABRIR LA PUERTA</p>
            <h2 id="secret-cellar-identity-title">¿DÓNDE GUARDAMOS TU PREMIO?</h2>
            <p>Usamos este dato sólo para reconocer tu intento de hoy. Sin rastreo invasivo.</p>
            <div className={styles.identityTabs}>
              <button type="button" disabled={selectionLocked} data-active={contactKind === "EMAIL"} onClick={() => setContactKind("EMAIL")}>EMAIL</button>
              <button type="button" disabled={selectionLocked} data-active={contactKind === "WHATSAPP"} onClick={() => setContactKind("WHATSAPP")}>WHATSAPP</button>
            </div>
            <label>
              <span>{contactKind === "EMAIL" ? "TU EMAIL" : "TU WHATSAPP"}</span>
              <input
                autoFocus
                required
                disabled={selectionLocked}
                type={contactKind === "EMAIL" ? "email" : "tel"}
                autoComplete={contactKind === "EMAIL" ? "email" : "tel"}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={contactKind === "EMAIL" ? "vos@ejemplo.com" : "+54 9 341 ..."}
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.confirm} type="submit" disabled={submitting}>
              {submitting ? "ABRIENDO…" : selectionLocked ? "VOLVER A COMPROBAR →" : "COMPROBAR BOTELLA →"}
            </button>
          </form>
        </div>
      ) : null}
      {!identifying && error ? <p className={styles.boardError}>{error}</p> : null}
    </section>
  );
}
