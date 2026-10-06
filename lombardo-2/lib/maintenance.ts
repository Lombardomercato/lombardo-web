const MAINTENANCE_BYPASS_PREFIXES = [
  "/admin",
  "/auth",
  "/api/admin",
  "/admin/api",
  "/api/cron",
  "/api/internal",
  "/api/payments/mercadopago/webhook",
];

export function isMaintenanceModeEnabled(
  value = process.env.SITE_MAINTENANCE_MODE,
) {
  return value?.trim().toLowerCase() === "true";
}

export function isMaintenanceBypassPath(pathname: string) {
  return (
    pathname === "/en-construccion" ||
    pathname === "/robots.txt" ||
    MAINTENANCE_BYPASS_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  );
}

export function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export function renderMaintenancePage() {
  return `<!doctype html>
<html lang="es-AR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow, noarchive" />
    <title>LOMBARDO. — En construcción</title>
    <style>
      :root {
        color-scheme: light;
        --blue: #003a70;
        --pink: #ffb3ab;
        --paper: #fffdf9;
        --red: #e03c31;
      }

      * { box-sizing: border-box; }

      html, body { min-height: 100%; }

      body {
        margin: 0;
        min-height: 100vh;
        background: var(--paper);
        color: var(--blue);
        font-family: Arial, Helvetica, sans-serif;
      }

      main {
        min-height: 100vh;
        display: grid;
        grid-template-rows: auto 1fr auto;
        padding: clamp(1.25rem, 4vw, 4rem);
      }

      .brand {
        margin: 0;
        font-size: clamp(1.15rem, 2vw, 1.5rem);
        font-weight: 800;
        letter-spacing: -0.04em;
      }

      .content {
        width: min(100%, 78rem);
        margin: auto;
        display: grid;
        grid-template-columns: minmax(0, 1.3fr) minmax(17rem, 0.7fr);
        align-items: center;
        gap: clamp(2rem, 7vw, 8rem);
        padding: 3rem 0;
      }

      .eyebrow {
        display: inline-block;
        margin-bottom: 1.25rem;
        padding: 0.45rem 0.75rem;
        border: 2px solid currentColor;
        font-size: 0.75rem;
        font-weight: 800;
        letter-spacing: 0.12em;
      }

      h1 {
        max-width: 100%;
        margin: 0;
        font-size: clamp(3.7rem, 7vw, 6.5rem);
        line-height: 0.86;
        letter-spacing: -0.075em;
        text-transform: uppercase;
      }

      .message {
        max-width: 35rem;
        margin: 2rem 0 0;
        font-size: clamp(1.1rem, 2vw, 1.45rem);
        line-height: 1.45;
      }

      .worksite {
        min-height: 23rem;
        display: grid;
        place-items: center;
        background: var(--pink);
        border: 2px solid var(--blue);
        overflow: hidden;
      }

      .worksite svg {
        width: min(78%, 19rem);
        height: auto;
      }

      footer {
        border-top: 2px solid var(--blue);
        padding-top: 1rem;
        font-size: 0.8rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      @media (max-width: 48rem) {
        .content {
          grid-template-columns: 1fr;
          gap: 2.25rem;
          padding: 3rem 0 2rem;
        }

        h1 {
          font-size: clamp(2.55rem, 10.8vw, 4.5rem);
          line-height: 0.9;
        }
        .worksite { min-height: 17rem; }
      }
    </style>
  </head>
  <body>
    <main>
      <p class="brand">LOMBARDO.</p>
      <section class="content">
        <div>
          <span class="eyebrow">PAUSA TEMPORAL</span>
          <h1>Estamos en construcción.</h1>
          <p class="message">Estamos trabajando para volver con una nueva etapa. Nos vemos pronto.</p>
        </div>
        <div class="worksite" aria-label="Persona trabajando">
          <svg viewBox="0 0 320 320" role="img" aria-hidden="true">
            <rect x="38" y="246" width="244" height="16" fill="#003a70" />
            <rect x="64" y="92" width="14" height="154" fill="#fffdf9" stroke="#003a70" stroke-width="6" />
            <rect x="242" y="92" width="14" height="154" fill="#fffdf9" stroke="#003a70" stroke-width="6" />
            <path d="M69 122h178M69 164h178M69 206h178" stroke="#003a70" stroke-width="8" />
            <circle cx="160" cy="112" r="34" fill="#fffdf9" stroke="#003a70" stroke-width="7" />
            <path d="M121 105c3-28 18-44 39-44s36 16 39 44h-78Z" fill="#e03c31" stroke="#003a70" stroke-width="7" />
            <path d="M113 105h94" stroke="#003a70" stroke-width="9" stroke-linecap="round" />
            <path d="M120 174c0-28 18-45 40-45s40 17 40 45v69h-80v-69Z" fill="#003a70" />
            <path d="M118 164 82 201M202 164l36 37" stroke="#003a70" stroke-width="18" stroke-linecap="round" />
            <path d="m141 154 19 22 19-22" fill="none" stroke="#ffb3ab" stroke-width="7" />
          </svg>
        </div>
      </section>
      <footer>www.lombardomercato.com</footer>
    </main>
  </body>
</html>`;
}
