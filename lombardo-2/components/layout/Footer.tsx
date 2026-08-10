import Link from "next/link";
import { SITE_CONTACT } from "@/lib/config/site";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer id="contacto" className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.brandBlock}>
          <p className={styles.brand}>LOMBARDO.</p>
          <p>Rosario, Santa Fe.</p>
        </div>

        <div className={styles.contactBlock} aria-label="Canales de contacto">
          {SITE_CONTACT.whatsappUrl ? (
            <Link href={SITE_CONTACT.whatsappUrl}>WhatsApp ↗</Link>
          ) : (
            <span title="Número pendiente de confirmación">WhatsApp</span>
          )}
          <Link href={SITE_CONTACT.instagramUrl} target="_blank" rel="noreferrer">
            Instagram ↗
          </Link>
        </div>

        <p className={styles.note}>Vinos, regalos y cosas buenas.</p>
      </div>
    </footer>
  );
}
