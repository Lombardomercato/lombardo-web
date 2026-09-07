import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { TrackedCommercialLink } from "@/components/analytics/CommercialJourney";
import { SITE_CONTACT } from "@/lib/config/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Ventas a empresas y negocios en Rosario",
  description: "Compras por cantidad, listas para negocios, regalos corporativos a medida y Factura A con atención Lombardo.",
  alternates: { canonical: "/empresas" },
};

const options = [
  ["01", "MAYORISTA", "Desde 6 botellas. Pueden ser surtidas y el mejor precio válido se aplica automáticamente."],
  ["02", "NEGOCIOS", "Para comercios, bares, restaurantes, kioscos, vinotecas y reventa con cuenta verificada."],
  ["03", "REGALOS CORPORATIVOS", "Armamos una selección a medida según cantidad, presupuesto, ocasión y entregas."],
  ["04", "FACTURA A", "Prepará la compra con los datos fiscales de tu empresa desde el primer contacto."],
] as const;

export default function EmpresasPage() {
  const contactHref = SITE_CONTACT.whatsappUrl ?? "/#contacto";
  return (
    <>
      <main className={styles.page}>
        <header className={styles.hero}>
          <p>LOMBARDO MAYORISTA + NEGOCIOS</p>
          <h1>COMPRAR MÁS. SIN DAR MÁS VUELTAS.</h1>
          <div>
            <p>Con 6 botellas surtidas ya accedés a precio mayorista. Si comprás para reventa, te habilitamos precios específicos de Negocio.</p>
            <div className={styles.heroActions}>
              <TrackedCommercialLink
                href={contactHref}
                target={SITE_CONTACT.whatsappUrl ? "_blank" : undefined}
                rel={SITE_CONTACT.whatsappUrl ? "noreferrer" : undefined}
                event={{ name: "business_account_requested", source: "empresas" }}
              >SOLICITAR CUENTA <span aria-hidden="true">→</span></TrackedCommercialLink>
              <Link href="/login?next=%2Fmi-cuenta">YA TENGO CUENTA → INGRESAR</Link>
            </div>
          </div>
        </header>

        <section className={styles.options} aria-labelledby="companies-options-title">
          <h2 id="companies-options-title">¿QUÉ PODEMOS RESOLVER?</h2>
          <div>
            {options.map(([index, title, copy]) => <article key={index}><span>{index}</span><h3>{title}</h3><p>{copy}</p></article>)}
          </div>
        </section>

        <section className={styles.nextStep}>
          <div><p>PARA EMPEZAR</p><h2>CANTIDAD + PRESUPUESTO + FECHA.</h2></div>
          <p>Con esos tres datos podemos orientar la selección sin hacerte perder tiempo. La disponibilidad se confirma antes de preparar el pedido.</p>
          <div className={styles.actions}>
            <TrackedCommercialLink
              href={contactHref}
              target={SITE_CONTACT.whatsappUrl ? "_blank" : undefined}
              rel={SITE_CONTACT.whatsappUrl ? "noreferrer" : undefined}
              event={{ name: "business_account_requested", source: "empresas" }}
            >SOLICITAR CUENTA →</TrackedCommercialLink>
            <Link href="/login?next=%2Fmi-cuenta">YA TENGO CUENTA → INGRESAR</Link>
            <Link href="/guias/regalos-empresariales-rosario">LEER LA GUÍA PARA EMPRESAS</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
