import { requireAdminSession } from "@/lib/server/admin/admin-auth";
import { loadAdminSecretCellar } from "@/lib/server/admin/admin-data";
import { formatAdminDate } from "@/lib/admin/presentation";
import {
  excludeSecretCellarProductAction,
  regenerateNextSecretCellarAction,
  removeSecretCellarExclusionAction,
  updateSecretCellarSettingsAction,
} from "@/app/admin/actions";
import adminStyles from "../../admin.module.css";
import styles from "./SecretCellarAdmin.module.css";

export default async function AdminSecretCellarPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const [dashboard, session, feedback] = await Promise.all([
    loadAdminSecretCellar(),
    requireAdminSession(),
    searchParams,
  ]);
  const canEdit = session.role === "admin";
  const currentSecret = dashboard.current?.candidates.find(
    (candidate) => candidate.id === dashboard.current?.secretProductId,
  );
  const nextSecret = dashboard.next?.candidates.find(
    (candidate) => candidate.id === dashboard.next?.secretProductId,
  );

  return (
    <>
      <header className={adminStyles.pageHeader}>
        <div>
          <p className={adminStyles.eyebrow}>EXPERIENCIA DIARIA</p>
          <h1>CAVA SECRETA.</h1>
        </div>
        <p>El desafío de hoy es inmutable. Toda configuración y exclusión impacta desde el próximo.</p>
      </header>
      {feedback.success ? <p className={adminStyles.formSuccess}>{feedback.success}</p> : null}
      {feedback.error ? <p className={adminStyles.formError}>{feedback.error}</p> : null}

      <section className={adminStyles.metricGrid}>
        <article className={adminStyles.metricCard}><span>PARTICIPANTES</span><strong>{dashboard.participants}</strong></article>
        <article className={adminStyles.metricCard}><span>ACIERTOS</span><strong>{dashboard.found}</strong></article>
        <article className={adminStyles.metricCard}><span>ERRORES</span><strong>{dashboard.missed}</strong></article>
        <article className={adminStyles.metricCard}><span>CUPONES</span><strong>{dashboard.couponsIssued}</strong></article>
        <article className={adminStyles.metricCard}><span>CONVERSIONES</span><strong>{dashboard.converted}</strong></article>
        <article className={adminStyles.metricCard}><span>ESTADO</span><strong>{dashboard.settings.enabled ? "ON" : "OFF"}</strong></article>
      </section>

      <section className={adminStyles.section}>
        <div className={adminStyles.sectionTitle}><h2>DESAFÍO DE HOY</h2><span>{dashboard.current?.date ?? "SIN GENERAR"}</span></div>
        {dashboard.current && currentSecret ? (
          <div className={styles.challengeLayout}>
            <article className={styles.secretCard}>
              <span>BOTELLA SECRETA · NO EDITABLE</span>
              <strong>{currentSecret.name}</strong>
              <p>{currentSecret.brand} · {currentSecret.presentation}</p>
              <small>{currentSecret.id}</small>
            </article>
            <div className={styles.clueList}>
              {dashboard.current.clues.map((clue, index) => (
                <div key={clue.id}><span>PISTA {String(index + 1).padStart(2, "0")}</span><strong>{clue.text}</strong><small>{clue.source}</small></div>
              ))}
            </div>
          </div>
        ) : <p className={adminStyles.emptyState}>No hay challenge activo.</p>}
      </section>

      {dashboard.current ? (
        <section className={adminStyles.section}>
          <div className={adminStyles.sectionTitle}><h2>CANDIDATOS DE HOY</h2><span>{dashboard.current.candidates.length}</span></div>
          <div className={styles.candidateList}>
            {dashboard.current.candidates.map((candidate) => (
              <article key={candidate.id} data-secret={candidate.id === dashboard.current?.secretProductId}>
                <span>{candidate.id === dashboard.current?.secretProductId ? "SECRETA" : "DISTRACTOR"}</span>
                <strong>{candidate.name}</strong>
                <small>{candidate.brand} · {candidate.presentation}</small>
                {canEdit ? (
                  <form action={excludeSecretCellarProductAction}>
                    <input type="hidden" name="productId" value={candidate.id} />
                    <input type="hidden" name="reason" value="Excluido desde el challenge actual" />
                    <button type="submit">EXCLUIR DE PRÓXIMOS</button>
                  </form>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={adminStyles.section}>
        <div className={adminStyles.sectionTitle}><h2>PRÓXIMO CHALLENGE</h2><span>{dashboard.next?.date ?? "NO GENERADO"}</span></div>
        <div className={styles.nextChallenge}>
          <div>
            <strong>{nextSecret?.name ?? "Se generará automáticamente al abrirse."}</strong>
            <p>{dashboard.next ? `${dashboard.next.candidates.length} candidatos · ${dashboard.next.clues.length} pistas` : "La regeneración crea sólo el desafío de mañana."}</p>
          </div>
          {canEdit ? <form action={regenerateNextSecretCellarAction}><button type="submit">REGENERAR MAÑANA →</button></form> : null}
        </div>
      </section>

      <section className={adminStyles.section}>
        <div className={adminStyles.sectionTitle}><h2>CONFIGURACIÓN</h2><span>PRÓXIMO DESAFÍO</span></div>
        {canEdit ? (
          <form action={updateSecretCellarSettingsAction} className={styles.settingsForm}>
            <label className={styles.toggle}><input name="enabled" type="checkbox" defaultChecked={dashboard.settings.enabled} /><span>Experiencia activa</span></label>
            <label><span>Candidatos</span><input name="candidateCount" type="number" min="8" max="12" defaultValue={dashboard.settings.candidateCount} required /></label>
            <label><span>Pistas</span><input name="clueCount" type="number" min="4" max="5" defaultValue={dashboard.settings.clueCount} required /></label>
            <label><span>Premio % OFF</span><input name="rewardPercentage" type="number" min="1" max="99" step="0.01" defaultValue={dashboard.settings.rewardPercentage} required /></label>
            <label><span>Validez (horas)</span><input name="rewardValidHours" type="number" min="1" max="168" defaultValue={dashboard.settings.rewardValidHours} required /></label>
            <button type="submit">GUARDAR CONFIGURACIÓN</button>
          </form>
        ) : <p className={adminStyles.emptyState}>Sólo un administrador puede modificar la experiencia.</p>}
      </section>

      <section className={adminStyles.section}>
        <div className={adminStyles.sectionTitle}><h2>EXCLUSIONES</h2><span>{dashboard.exclusions.length}</span></div>
        {canEdit ? (
          <form action={excludeSecretCellarProductAction} className={styles.exclusionForm}>
            <label><span>ID DEL PRODUCTO SAFE</span><input name="productId" required maxLength={36} placeholder="UUID de Runia" /></label>
            <label><span>MOTIVO</span><input name="reason" maxLength={500} placeholder="Opcional" /></label>
            <button type="submit">AGREGAR EXCLUSIÓN</button>
          </form>
        ) : null}
        {dashboard.exclusions.length ? (
          <div className={styles.exclusionList}>
            {dashboard.exclusions.map((exclusion) => (
              <div key={exclusion.productId}>
                <span>{exclusion.productSku}</span>
                <strong>{exclusion.productName}</strong>
                <small>{exclusion.reason || "Sin motivo"}</small>
                {canEdit ? <form action={removeSecretCellarExclusionAction}><input type="hidden" name="productId" value={exclusion.productId} /><button type="submit">QUITAR</button></form> : null}
              </div>
            ))}
          </div>
        ) : <p className={adminStyles.emptyState}>No hay productos excluidos.</p>}
      </section>

      <section className={adminStyles.section}>
        <div className={adminStyles.sectionTitle}><h2>INTENTOS DE HOY</h2><span>{dashboard.attempts.length}</span></div>
        {dashboard.attempts.length ? (
          <div className={styles.attemptList}>
            {dashboard.attempts.map((attempt) => (
              <div key={attempt.id}>
                <strong>{attempt.playerLabel}</strong>
                <span data-result={attempt.result}>{attempt.result === "FOUND" ? "ACIERTO" : "ERROR"}</span>
                <span>{attempt.couponCode ?? "SIN CUPÓN"}</span>
                <small>{formatAdminDate(attempt.attemptedAt)}</small>
              </div>
            ))}
          </div>
        ) : <p className={adminStyles.emptyState}>Todavía nadie jugó hoy.</p>}
      </section>
    </>
  );
}
