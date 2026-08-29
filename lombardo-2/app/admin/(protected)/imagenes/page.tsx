import Link from "next/link";
import { loadAdminImageCandidates, loadProductsWithoutImageMatch } from "@/lib/server/admin/admin-data";
import type { MatchConfidenceBand, MatchReviewStatus } from "@/lib/server/admin/types";
import styles from "../../admin.module.css";
import { ImageCandidateQueue } from "./ImageCandidateQueue";

type Query = Record<string, string | string[] | undefined>;
type ImageView = "without_image" | "auto" | "needs_review" | "high" | "medium" | "corrected" | "rejected";
const VIEWS: ImageView[] = ["without_image", "auto", "needs_review", "high", "medium", "corrected", "rejected"];

function value(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] : "";
}

function pageHref(view: ImageView, offset = 0) {
  const params = new URLSearchParams({ view });
  if (offset > 0) params.set("offset", String(offset));
  return `/admin/imagenes?${params}`;
}

export default async function AdminImageCandidatesPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const requestedView = value(query, "view") as ImageView;
  const view = VIEWS.includes(requestedView) ? requestedView : "needs_review";
  const offset = /^\d+$/.test(value(query, "offset")) ? Number(value(query, "offset")) : 0;
  const success = value(query, "success");
  const error = value(query, "error");

  let status: MatchReviewStatus = "approved";
  let confidence: MatchConfidenceBand | undefined;
  let publicationStatus: "pending" | "approved" | "rejected" | undefined;
  let approvalMode: "auto" | undefined;
  let qualityStatus: "needs_review" | "corrected" | undefined;
  if (view === "auto") {
    publicationStatus = "approved";
    approvalMode = "auto";
  } else if (view === "needs_review") {
    publicationStatus = "approved";
    qualityStatus = "needs_review";
  } else if (view === "high") {
    publicationStatus = "approved";
    confidence = "high";
  } else if (view === "medium") {
    publicationStatus = "approved";
    confidence = "medium";
  } else if (view === "corrected") {
    publicationStatus = "approved";
    qualityStatus = "corrected";
  } else if (view === "rejected") {
    status = "rejected";
  }

  const page = view === "without_image"
    ? await loadProductsWithoutImageMatch({ offset, limit: 25 })
    : await loadAdminImageCandidates({ status, confidenceBand: confidence, publicationStatus, approvalMode, qualityStatus, offset, limit: 25 });
  const unmatchedPage = "products" in page ? page : null;
  const candidatePage = "candidates" in page ? page : null;

  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>COBERTURA · MULTIFUENTE</p><h1>IMÁGENES.</h1></div>
        <p>Fuente, confianza y revisión visibles. <Link href="/admin/imagenes/sistema-lombardo">PRODUCT IMAGE SYSTEM V1 APROBADO →</Link></p>
      </header>
      {success ? <p className={styles.notice}>{success}</p> : null}
      {error ? <p className={styles.errorNotice}>{error}</p> : null}
      <nav className={styles.candidateTabs} aria-label="Estado de imágenes">
        <Link data-active={view === "without_image"} href={pageHref("without_image")}>SIN IMAGEN</Link>
        <Link data-active={view === "auto"} href={pageHref("auto")}>AUTO-PUBLICADAS</Link>
        <Link data-active={view === "needs_review"} href={pageHref("needs_review")}>NEEDS_REVIEW</Link>
        <Link data-active={view === "high"} href={pageHref("high")}>HIGH</Link>
        <Link data-active={view === "medium"} href={pageHref("medium")}>MEDIUM</Link>
        <Link data-active={view === "corrected"} href={pageHref("corrected")}>CORREGIDAS</Link>
        <Link data-active={view === "rejected"} href={pageHref("rejected")}>RECHAZADAS</Link>
      </nav>
      <p className={styles.readOnlyNotice}>{page.total} productos o candidatos en este filtro.</p>

      {view === "without_image" ? (
        unmatchedPage?.products.length ? (
          <div className={styles.productList}>
            {unmatchedPage.products.map((product) => (
              <Link className={styles.productRow} href={`/admin/productos/${product.id}`} key={product.id}>
                <strong>{product.sku}</strong>
                <span><strong>{product.name}</strong><small className={styles.muted}>{product.presentation}</small></span>
                <span>FALLBACK LOMBARDO · SIN IMAGEN PUBLICADA</span>
              </Link>
            ))}
          </div>
        ) : <p className={styles.emptyState}>No hay productos SAFE sin imagen publicada.</p>
      ) : (
        candidatePage?.candidates.length
          ? <ImageCandidateQueue candidates={candidatePage.candidates} status={status} confidence={confidence} />
          : <p className={styles.emptyState}>No hay candidatos en este filtro.</p>
      )}

      <nav className={styles.pagination} aria-label="Paginación de imágenes">
        {page.offset > 0 ? <Link className={styles.secondaryButton} href={pageHref(view, page.offset - page.limit)}>ANTERIOR</Link> : <span />}
        {page.hasMore ? <Link className={styles.secondaryButton} href={pageHref(view, page.offset + page.limit)}>SIGUIENTE</Link> : null}
      </nav>
    </>
  );
}
