"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import type {
  SecretCellarAttemptResult,
  SecretCellarCandidate,
  SecretCellarPublicExperience,
} from "@/lib/secret-cellar/types";
import styles from "./SecretCellarGame.module.css";

function CandidateArtwork({ candidate }: { candidate: SecretCellarCandidate }) {
  return candidate.imageUrl ? (
    <Image
      src={candidate.imageUrl}
      alt={`Botella de ${candidate.name}`}
      fill
      sizes="(max-width: 720px) 45vw, (max-width: 1180px) 22vw, 16vw"
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
  const [selectedId, setSelectedId] = useState("");
  const [eliminated, setEliminated] = useState<Set<string>>(new Set());
  const [identifying, setIdentifying] = useState(false);
  const [contactKind, setContactKind] = useState<"EMAIL" | "WHATSAPP">("EMAIL");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SecretCellarAttemptResult | null>(null);
  const [error, setError] = useState("");
  const [shared, setShared] = useState(false);

  const selected = useMemo(
    () => challenge?.candidates.find((candidate) => candidate.id === selectedId),
    [challenge, selectedId],
  );

  if (!experience.enabled || !challenge) {
    return (
      <section className={styles.closed}>
        <p>LA CAVA SECRETA</p>
        <h1>LA PUERTA ESTÁ CERRADA.</h1>
        <p>Estamos guardando la próxima botella. Volvé en un rato.</p>
        <Link href="/">VOLVER A LOMBARDO →</Link>
      </section>
    );
  }

  const submitAttempt = async () => {
    if (!selectedId || submitting) return;
    if (!challenge.playerIsAuthenticated && !identifying) {
      setIdentifying(true);
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/cava-secreta/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          challengeId: challenge.id,
          selectedProductId: selectedId,
          guestContactKind: challenge.playerIsAuthenticated ? undefined : contactKind,
          guestContact: challenge.playerIsAuthenticated ? undefined : contact,
        }),
      });
      const payload = (await response.json()) as SecretCellarAttemptResult & { message?: string };
      if (!response.ok) throw new Error(payload.message || "No pudimos comprobar la botella.");
      setResult(payload);
      setIdentifying(false);
    } catch (attemptError) {
      setError(attemptError instanceof Error ? attemptError.message : "No pudimos comprobar la botella.");
    } finally {
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
          <p>{found ? "LA ENCONTRASTE." : "CASI."}</p>
          <h1>{found ? "LA CAVA SE ABRE PARA VOS." : "LA CAVA CAMBIA MAÑANA."}</h1>
          <p>
            {found
              ? `Tu premio es ${challenge.rewardPercentage}% OFF para una compra retail. Tenés ${challenge.rewardValidHours} horas.`
              : "La botella de hoy estaba más cerca de lo que parecía. Mañana escondemos otra."}
          </p>
          {result.couponCode ? (
            <div className={styles.coupon}>
              <span>TU CÓDIGO ÚNICO</span>
              <strong>{result.couponCode}</strong>
              <small>1 uso · retail · no acumulable</small>
            </div>
          ) : null}
          <div className={styles.revealActions}>
            <Link href={`/productos/${result.secret.slug}`}>VER PRODUCTO →</Link>
            <button type="button" onClick={share}>
              {shared ? "LINK COPIADO" : "COMPARTIR"}
            </button>
          </div>
        </div>
        <article className={styles.secretBottle}>
          <div><CandidateArtwork candidate={result.secret} /></div>
          <span>LA BOTELLA DE HOY</span>
          <h2>{result.secret.name}</h2>
          <p>{result.secret.brand} · {result.secret.presentation}</p>
        </article>
      </section>
    );
  }

  const visibleClues = challenge.clues.slice(0, clueIndex + 1);
  const finalClue = clueIndex >= challenge.clues.length - 1;

  return (
    <section className={styles.game}>
      <header className={styles.intro}>
        <div>
          <p>LOMBARDO. · DESAFÍO DIARIO</p>
          <h1>LA CAVA<br /><em>SECRETA.</em></h1>
        </div>
        <div className={styles.brief}>
          <strong>HAY UNA BOTELLA ESCONDIDA.</strong>
          <span>ENCONTRALA.</span>
          <p>Una sola elección. Una oportunidad por día.</p>
        </div>
      </header>

      <div className={styles.cluePanel} aria-live="polite">
        <span>PISTA {String(clueIndex + 1).padStart(2, "0")}</span>
        <p>{challenge.clues[clueIndex]?.text}</p>
        <small>{visibleClues.length} / {challenge.clues.length} pistas abiertas</small>
      </div>

      <div className={styles.boardHeader}>
        <p>TOCÁ PARA ELEGIR · DESCARTÁ PARA ORDENAR TUS SOSPECHAS</p>
        <span>{challenge.candidates.length - eliminated.size} EN JUEGO</span>
      </div>
      <div className={styles.candidateGrid}>
        {challenge.candidates.map((candidate, index) => {
          const isEliminated = eliminated.has(candidate.id);
          const isSelected = selectedId === candidate.id;
          return (
            <article
              className={styles.candidate}
              data-eliminated={isEliminated}
              data-selected={isSelected}
              key={candidate.id}
            >
              <button
                className={styles.candidateChoice}
                type="button"
                disabled={isEliminated}
                aria-pressed={isSelected}
                onClick={() => setSelectedId(candidate.id)}
              >
                <span className={styles.candidateNumber}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.candidateImage}><CandidateArtwork candidate={candidate} /></span>
                <strong>{candidate.name}</strong>
                <small>{candidate.presentation}</small>
              </button>
              <button
                className={styles.eliminate}
                type="button"
                onClick={() => {
                  const next = new Set(eliminated);
                  if (isEliminated) next.delete(candidate.id);
                  else {
                    next.add(candidate.id);
                    if (selectedId === candidate.id) setSelectedId("");
                  }
                  setEliminated(next);
                }}
              >
                {isEliminated ? "VOLVER A MIRAR" : "DESCARTAR"}
              </button>
            </article>
          );
        })}
      </div>

      <div className={styles.decisionBar}>
        <div>
          <span>{selected ? "TU ELECCIÓN" : "TODAVÍA ESTÁS MIRANDO"}</span>
          <strong>{selected?.name ?? "Elegí una botella"}</strong>
        </div>
        {!finalClue ? (
          <button type="button" onClick={() => setClueIndex((current) => current + 1)}>
            ABRIR PISTA {String(clueIndex + 2).padStart(2, "0")} →
          </button>
        ) : (
          <button type="button" disabled={!selectedId} onClick={submitAttempt}>
            ESTA ES LA BOTELLA →
          </button>
        )}
      </div>

      {identifying ? (
        <div className={styles.identityBackdrop}>
          <form
            className={styles.identityCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="secret-cellar-identity-title"
            onSubmit={(event) => { event.preventDefault(); void submitAttempt(); }}
          >
            <button className={styles.closeIdentity} type="button" onClick={() => setIdentifying(false)} aria-label="Cerrar">×</button>
            <p>ANTES DE ABRIR LA PUERTA</p>
            <h2 id="secret-cellar-identity-title">¿DÓNDE GUARDAMOS TU PREMIO?</h2>
            <p>Usamos este dato sólo para reconocer tu intento de hoy. Sin rastreo invasivo.</p>
            <div className={styles.identityTabs}>
              <button type="button" data-active={contactKind === "EMAIL"} onClick={() => setContactKind("EMAIL")}>EMAIL</button>
              <button type="button" data-active={contactKind === "WHATSAPP"} onClick={() => setContactKind("WHATSAPP")}>WHATSAPP</button>
            </div>
            <label>
              <span>{contactKind === "EMAIL" ? "TU EMAIL" : "TU WHATSAPP"}</span>
              <input
                autoFocus
                required
                type={contactKind === "EMAIL" ? "email" : "tel"}
                autoComplete={contactKind === "EMAIL" ? "email" : "tel"}
                value={contact}
                onChange={(event) => setContact(event.target.value)}
                placeholder={contactKind === "EMAIL" ? "vos@ejemplo.com" : "+54 9 341 ..."}
              />
            </label>
            {error ? <p className={styles.error}>{error}</p> : null}
            <button className={styles.confirm} type="submit" disabled={submitting}>
              {submitting ? "ABRIENDO…" : "COMPROBAR BOTELLA →"}
            </button>
          </form>
        </div>
      ) : null}
      {!identifying && error ? <p className={styles.boardError}>{error}</p> : null}
    </section>
  );
}
