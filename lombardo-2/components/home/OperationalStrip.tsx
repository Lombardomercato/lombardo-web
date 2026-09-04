import styles from "./OperationalStrip.module.css";

export function OperationalStrip() {
  return (
    <section className={styles.strip} aria-label="Información de compra y entrega">
      <p><strong>ENVÍO SIN CARGO</strong><span>Rosario y zona</span></p>
      <p><strong>COMPRA ONLINE</strong><span>Simple y acompañada</span></p>
      <p><strong>FORMAS DE PAGO</strong><span>Online, transferencia o efectivo</span></p>
    </section>
  );
}
