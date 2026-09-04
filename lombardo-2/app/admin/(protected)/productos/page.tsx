import Link from "next/link";
import { AdminDynamicProductSearch } from "@/components/admin/AdminDynamicProductSearch";
import { ELIGIBILITY_LABELS } from "@/lib/admin/presentation";
import { RUNIA_CATALOG_CATEGORIES } from "@/lib/commerce/runia-catalog-mapper";
import { loadAdminProducts } from "@/lib/server/admin/admin-data";
import type { AdminProduct } from "@/lib/server/admin/types";
import { formatCurrency } from "@/lib/utils/format-currency";
import styles from "../../admin.module.css";

type Query = Record<string, string | string[] | undefined>;
const eligibilityValues = Object.keys(ELIGIBILITY_LABELS) as AdminProduct["eligibilityStatus"][];

function value(query: Query, key: string) {
  return typeof query[key] === "string" ? query[key] as string : "";
}

function pageHref(query: Query, offset: number) {
  const params = new URLSearchParams();
  for (const key of ["buscar", "eligibility", "categoria"]) {
    const current = value(query, key);
    if (current) params.set(key, current);
  }
  params.set("offset", String(Math.max(0, offset)));
  return `/admin/productos?${params}`;
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const eligibility = value(query, "eligibility");
  const offset = /^\d+$/.test(value(query, "offset")) ? Number(value(query, "offset")) : 0;
  const page = await loadAdminProducts({
    offset,
    limit: 50,
    search: value(query, "buscar"),
    eligibility: eligibilityValues.includes(eligibility as AdminProduct["eligibilityStatus"])
      ? eligibility as AdminProduct["eligibilityStatus"]
      : undefined,
    category: value(query, "categoria"),
  });

  return (
    <>
      <header className={styles.pageHeader}>
        <div><p className={styles.eyebrow}>RUNIA + EDITORIAL LOMBARDO</p><h1>PRODUCTOS V2.</h1></div>
        <p>{page.total} productos encontrados.</p>
      </header>
      <form className={styles.filterForm}>
        <div className={styles.filterField}>
          <label htmlFor="buscar">BUSCAR</label>
          <AdminDynamicProductSearch initialValue={value(query, "buscar")} />
        </div>
        <div className={styles.filterField}>
          <label htmlFor="categoria">CATEGORÍA</label>
          <select id="categoria" name="categoria" defaultValue={value(query, "categoria")}>
            <option value="">TODAS</option>
            {RUNIA_CATALOG_CATEGORIES.map((category) => <option key={category.slug} value={category.slug}>{category.name.toLocaleUpperCase("es-AR")}</option>)}
          </select>
        </div>
        <div className={styles.filterField}>
          <label htmlFor="eligibility">ELIGIBILITY RUNIA</label>
          <select id="eligibility" name="eligibility" defaultValue={eligibility}>
            <option value="">TODOS</option>
            {eligibilityValues.map((status) => <option key={status} value={status}>{ELIGIBILITY_LABELS[status]}</option>)}
          </select>
        </div>
        <button className={styles.primaryButton} type="submit">FILTRAR</button>
      </form>

      {page.products.length ? (
        <div className={styles.productList}>
          {page.products.map((product) => (
            <Link className={styles.productRow} href={`/admin/productos/${product.id}`} key={product.id}>
              <strong>{product.sku}</strong>
              <span><strong>{product.name}</strong><small className={styles.muted}>{product.brand} · {product.presentation}</small></span>
              <span>{product.category}</span>
              <strong>{product.retailPrice === null ? "—" : formatCurrency(product.retailPrice)}</strong>
              <span className={styles.eligibility} data-eligibility={product.eligibilityStatus}>{ELIGIBILITY_LABELS[product.eligibilityStatus]}</span>
              <span className={styles.publication} data-published={product.publicationStatus === "published"}>{product.publicationStatus === "published" ? "PUBLICADO" : "NO PUBLICADO"}</span>
            </Link>
          ))}
        </div>
      ) : <p className={styles.emptyState}>No hay productos para estos filtros.</p>}

      <nav className={styles.pagination} aria-label="Paginación de productos">
        {page.offset > 0 ? <Link className={styles.secondaryButton} href={pageHref(query, page.offset - page.limit)}>ANTERIOR</Link> : <span />}
        {page.hasMore ? <Link className={styles.secondaryButton} href={pageHref(query, page.offset + page.limit)}>SIGUIENTE</Link> : null}
      </nav>
    </>
  );
}
