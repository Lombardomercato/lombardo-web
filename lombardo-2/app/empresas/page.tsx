import type { Metadata } from "next";
import Link from "next/link";
import { Footer } from "@/components/layout/Footer";
import { SITE_CONTACT } from "@/lib/config/site";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Ventas a empresas y negocios en Rosario",
  description: "Compras por cantidad, listas para negocios, regalos corporativos a medida y Factura A con atención Lombardo.",
  alternates: { canonical: "/empresas" },
};

const options = [
  ["01", "COMPRAS POR CANTIDAD", "Resolvé vinos, bebidas y productos gourmet para eventos, equipos o consumo de oficina."],
  ["02", "NEGOCIOS Y REVENTA", "Consultá condiciones mayoristas o Business según tu actividad y volumen."],
  ["03", "REGALOS CORPORATIVOS", "Armamos una selección a medida según cantidad, presupuesto, ocasión y entregas."],
  ["04", "FACTURA A", "Prepará la compra con los datos fiscales de tu empresa desde el primer contacto."],
] as const;

export default function EmpresasPage() {
  const contactHref = SITE_CONTACT.whatsappUrl ?? "/#contacto";
  return (
    <>
      <main className={styles.page}>
        <header className={styles.hero}>
          <p>LOMBARDO PARA EMPRESAS</p>
          <h1>QUEDAR BIEN, TAMBIÉN EN CANTIDAD.</h1>
          <div>
            <p>Contanos cuántas unidades necesitás, para quiénes y con qué presupuesto. Te respondemos con opciones concretas.</p>
            <Link href={contactHref} target={SITE_CONTACT.whatsappUrl ? "_blank" : undefined} rel={SITE_CONTACT.whatsappUrl ? "noreferrer" : undefined}>HABLAR POR WHATSAPP <span aria-hidden="true">→</span></Link>
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
            <Link href={contactHref} target={SITE_CONTACT.whatsappUrl ? "_blank" : undefined} rel={SITE_CONTACT.whatsappUrl ? "noreferrer" : undefined}>PEDIR UNA PROPUESTA →</Link>
            <Link href="/guias/regalos-empresariales-rosario">LEER LA GUÍA PARA EMPRESAS</Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
