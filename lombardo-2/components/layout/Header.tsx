"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import styles from "./Header.module.css";

const navigation = [
  { label: "Oportunidades", href: "/oportunidades" },
  { label: "Regalos", href: "/categorias/regalos" },
  { label: "Vinos", href: "/categorias/vinos" },
  { label: "Guías", href: "/guias" },
  { label: "Empresas", href: "/guias/regalos-empresariales-rosario" },
  { label: "Experiencias", href: "/#experiencias" },
] as const;

export function Header() {
  const pathname = usePathname();
  const isSecretCellar = pathname.startsWith("/cava-secreta");
  const isEditorial = pathname === "/guias" || pathname.startsWith("/guias/");
  const { getItemCount, isDrawerOpen, openCart } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const itemCount = getItemCount();

  useEffect(() => {
    if (pathname === "/") return;

    const updateHeader = () => setIsScrolled(window.scrollY > 24);
    updateHeader();
    window.addEventListener("scroll", updateHeader, { passive: true });

    return () => window.removeEventListener("scroll", updateHeader);
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle("menu-open", isOpen);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.classList.remove("menu-open");
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const closeMenu = () => setIsOpen(false);

  return (
    <header
      className={`${styles.header} ${isSecretCellar ? styles.cellarHeader : ""} ${
        isEditorial ? styles.editorialHeader : ""
      } ${
        pathname !== "/" && isScrolled ? styles.scrolledHeader : ""
      }`}
    >
      <div className={styles.inner}>
        <Link href="/" className={styles.brand} aria-label="Lombardo, inicio">
          LOMBARDO
          <span className={styles.trademark} aria-hidden="true">™</span>
        </Link>

        <nav className={styles.desktopNav} aria-label="Navegación principal">
          {navigation.map((item) => (
            <Link key={item.label} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <Link className={styles.contact} href="/#contacto">
          Hablar con nosotros <span aria-hidden="true">↗</span>
        </Link>

        <Link
          className={styles.accountLink}
          href="/mi-cuenta"
          aria-current={pathname === "/mi-cuenta" ? "page" : undefined}
        >
          Mi cuenta
        </Link>

        <button
          className={styles.cartPreview}
          type="button"
          aria-label={`Abrir carrito, ${itemCount} ${itemCount === 1 ? "unidad" : "unidades"}`}
          aria-expanded={isDrawerOpen}
          aria-controls="cart-drawer"
          onClick={() => {
            setIsOpen(false);
            openCart();
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M5.5 8.5h13l-1 11h-11l-1-11Z" />
            <path d="M9 8.5a3 3 0 0 1 6 0" />
          </svg>
          <span aria-live="polite">{String(itemCount).padStart(2, "0")}</span>
        </button>

        <button
          className={styles.menuButton}
          type="button"
          aria-expanded={isOpen}
          aria-controls="mobile-navigation"
          onClick={() => setIsOpen((current) => !current)}
        >
          <span>{isOpen ? "Cerrar" : "Menú"}</span>
          <span
            className={`${styles.menuMark} ${isOpen ? styles.menuMarkOpen : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={`${styles.mobilePanel} ${isOpen ? styles.mobilePanelOpen : ""}`}
        aria-hidden={!isOpen}
      >
        <nav className={styles.mobileNav} aria-label="Navegación móvil">
          {navigation.map((item, index) => (
            <Link
              key={item.label}
              href={item.href}
              tabIndex={isOpen ? 0 : -1}
              onClick={closeMenu}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              {item.label}
            </Link>
          ))}
          <Link
            href="/mi-cuenta"
            tabIndex={isOpen ? 0 : -1}
            onClick={closeMenu}
          >
            <span>07</span>
            Mi cuenta
          </Link>
          <Link
            className={styles.mobileContact}
            href="/#contacto"
            tabIndex={isOpen ? 0 : -1}
            onClick={closeMenu}
          >
            Hablar con nosotros <span aria-hidden="true">↗</span>
          </Link>
        </nav>
      </div>
    </header>
  );
}
