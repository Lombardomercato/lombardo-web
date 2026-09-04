"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import giftBoxImage from "@/public/images/lombardo-gift-box-hero.png";
import birthdayImage from "@/public/images/situation-birthday.jpg";
import dinnerImage from "@/public/images/situation-dinner.jpg";
import selfImage from "@/public/images/situation-self.jpg";
import specialImage from "@/public/images/situation-special.jpg";
import styles from "./FirstAct.module.css";

const situations = [
  {
    label: "ME INVITARON A COMER.",
    href: "/categorias/vinos",
    context: "Llevá algo que abra la mesa.",
    image: dinnerImage,
    alt: "Vino, aceite de oliva y producto gourmet envuelto sobre fondo beige.",
  },
  {
    label: "TENGO UN CUMPLEAÑOS.",
    href: "/guias/regalar-vino-sin-saber-de-vino",
    context: "Una caja. Cero dudas.",
    image: birthdayImage,
    alt: "Caja azul de cumpleaños con vino y productos gourmet sobre fondo rosa.",
  },
  {
    label: "QUIERO QUEDAR MUY BIEN.",
    href: "/guias/regalar-vino-sin-saber-de-vino",
    context: "La selección que hace el trabajo.",
    image: giftBoxImage,
    alt: "Caja de regalo azul abierta con vino y productos gourmet.",
  },
  {
    label: "ES PARA ALGUIEN QUE TIENE DE TODO.",
    href: "/categorias/gourmet",
    context: "Para sorprender sin exagerar.",
    image: specialImage,
    alt: "Selección especial de bebidas y productos gourmet sobre fondo verde.",
  },
  {
    label: "QUIERO ALGO PARA MÍ.",
    href: "/categorias/vinos",
    context: "Porque vos también contás.",
    image: selfImage,
    alt: "Botella especial y chocolate envuelto sobre fondo azul.",
  },
] as const;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

export function FirstAct() {
  const sceneRef = useRef<HTMLElement>(null);
  const frameRef = useRef<number | null>(null);
  const phaseRef = useRef<"hero" | "situations">("hero");
  const [activeSituation, setActiveSituation] = useState(0);
  const [phase, setPhase] = useState<"hero" | "situations">("hero");
  const selectedSituation = situations[activeSituation];
  const openAssistant = () => window.dispatchEvent(new CustomEvent("lombardo:assistant-open"));

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const updateScene = () => {
      const bounds = scene.getBoundingClientRect();
      const scrollDistance = Math.max(scene.offsetHeight - window.innerHeight, 1);
      const progress = clamp(-bounds.top / scrollDistance, 0, 1);
      const nextPhase = progress >= 0.46 ? "situations" : "hero";
      const nextHeaderPhase = progress >= 0.24 ? "situations" : "hero";

      scene.style.setProperty("--scene-progress", progress.toFixed(4));

      if (phaseRef.current !== nextPhase) {
        phaseRef.current = nextPhase;
        scene.dataset.phase = nextPhase;
        setPhase(nextPhase);
      }

      if (document.body.dataset.scenePhase !== nextHeaderPhase) {
        document.body.dataset.scenePhase = nextHeaderPhase;
      }

      frameRef.current = null;
    };

    const requestUpdate = () => {
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(updateScene);
    };

    updateScene();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      delete document.body.dataset.scenePhase;
    };
  }, []);

  return (
    <section ref={sceneRef} className={styles.firstAct} data-phase="hero">
      <span id="situaciones" className={styles.situationsAnchor} aria-hidden="true" />
      <div className={styles.stickyScene}>
        <div className={styles.beigeLayer} aria-hidden="true" />
        <div className={styles.blueLayer} aria-hidden="true" />

        <div className={styles.heroContent}>
          <div className={styles.heroCopy}>
            <h1 className={styles.heroTitle}>
              <span className={styles.titleLineOne}>QUEDAR BIEN</span>
              <span className={styles.titleLineTwo}>ES FÁCIL.</span>
            </h1>

            <p className={styles.intro}>
              Vinos, bebidas y cosas buenas.
              <span>Comprá online con envío gratis en Rosario y zona.</span>
            </p>

            <div className={styles.actions}>
              <Link
                className={styles.primaryAction}
                href="/productos"
                tabIndex={phase === "hero" ? 0 : -1}
              >
                Ver catálogo <span aria-hidden="true">→</span>
              </Link>
              <button
                className={styles.secondaryAction}
                tabIndex={phase === "hero" ? 0 : -1}
                type="button"
                onClick={openAssistant}
              >
                Que Lombardo me ayude <span aria-hidden="true">→</span>
              </button>
            </div>
          </div>

          <p className={styles.scrollCue} aria-hidden="true">
            Bajá <span />
          </p>
        </div>

        <div
          className={`${styles.productStage} ${styles[`tone${activeSituation}`]}`}
        >
          <div className={styles.productEntrance}>
            <div className={styles.productImage}>
              <div
                className={styles.heroProductLayer}
                aria-hidden={phase !== "hero"}
              >
                <Image
                  src={giftBoxImage}
                  alt={
                    phase === "hero"
                      ? "Caja de regalo azul abierta con vino y productos gourmet."
                      : ""
                  }
                  fill
                  priority
                  placeholder="blur"
                  sizes="(max-width: 768px) 78vw, 46vw"
                />
              </div>

              <div className={styles.situationProductStack}>
                {situations.map((situation, index) => (
                  <div
                    key={situation.label}
                    className={`${styles.situationProductLayer} ${
                      index === activeSituation ? styles.activeProductLayer : ""
                    }`}
                    aria-hidden={index !== activeSituation || phase !== "situations"}
                  >
                    <Image
                      src={situation.image}
                      alt={
                        index === activeSituation && phase === "situations"
                          ? situation.alt
                          : ""
                      }
                      fill
                      placeholder="blur"
                      sizes="(max-width: 768px) 78vw, 40vw"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.situationCaption} aria-live="polite">
              <span>
                {String(activeSituation + 1).padStart(2, "0")} / 05
              </span>
              <p>{selectedSituation.context}</p>
            </div>
          </div>
        </div>

        <section
          className={styles.situations}
          aria-labelledby="situations-title"
          aria-hidden={phase !== "situations"}
        >
          <div className={styles.situationsInner}>
            <h2 id="situations-title" className={styles.situationsTitle}>
              <span>BUENO.</span>
              <span>¿QUÉ PASÓ?</span>
            </h2>

            <div className={styles.reducedSituationProduct}>
              <div>
                <Image
                  src={selectedSituation.image}
                  alt={selectedSituation.alt}
                  fill
                  placeholder="blur"
                  sizes="(max-width: 768px) 88vw, 40vw"
                />
              </div>
              <p>{selectedSituation.context}</p>
            </div>

            <div className={styles.situationList}>
              {situations.map((situation, index) => (
                <button
                  key={situation.label}
                  className={index === activeSituation ? styles.activeSituation : ""}
                  type="button"
                  tabIndex={phase === "situations" ? 0 : -1}
                  aria-pressed={index === activeSituation}
                  data-destination={situation.href}
                  onClick={() => setActiveSituation(index)}
                  onFocus={() => setActiveSituation(index)}
                  onMouseEnter={() => setActiveSituation(index)}
                >
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{situation.label}</span>
                </button>
              ))}
              <Link
                className={styles.situationAction}
                href={selectedSituation.href}
                tabIndex={phase === "situations" ? 0 : -1}
              >
                Ver opciones para esto <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}
