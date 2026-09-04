"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { GlobalSearch } from "@/components/search/GlobalSearch";
import styles from "./Header.module.css";

const storeNavigation = [
  { label: "Vinos", href: "/categorias/vinos" },
  { label: "Destilados", href: "/categorias/destilados" },
  { label: "Cervezas", href: "/categorias/cervezas" },
  { label: "Sin alcohol", href: "/categorias/sin-alcohol" },
  { label: "Gourmet", href: "/categorias/gourmet" },
  { label: "Accesorios", href: "/categorias/regalos" },
] as const;

const primaryNavigation = [
  { label: "Ofertas", href: "/oportunidades" },
  { label: "Guías", href: "/guias" },
  { label: "Empresas", href: "/empresas" },
] as const;

export function Header() {
  const pathname = usePathname();
  const isSecretCellar = pathname.startsWith("/cava-secreta");
  const isEditorial = pathname === "/guias" || pathname.startsWith("/guias/");
  const { getItemCount, isDrawerOpen, openCart } = useCart();
  const [isOpen, setIsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
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

  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const closeMenu = () => setIsOpen(false);
  const openAssistant = () => {
    setIsOpen(false);
    window.dispatchEvent(new CustomEvent("lombardo:assistant-open"));
  };

  return (
    <>
      <header className={`${styles.header} ${isSecretCellar ? styles.cellarHeader : ""} ${isEditorial ? styles.editorialHeader : ""} ${pathname !== "/" && isScrolled ? styles.scrolledHeader : ""}`}>
        <div className={styles.inner}>
          <Link href="/" className={styles.brand} aria-label="Lombardo, inicio">
            LOMBARDO<span className={styles.trademark} aria-hidden="true">TM</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Navegación principal">
            <div className={styles.storeMenu}>
              <Link href="/productos">Tienda</Link>
              <div className={styles.storePanel}>
                {storeNavigation.map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}
              </div>
            </div>
            {primaryNavigation.map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}
          </nav>

          <div className={styles.utilities} aria-label="Herramientas">
            <button type="button" onClick={() => setSearchOpen(true)}>Buscar</button>
            <Link href="/mi-cuenta" aria-current={pathname === "/mi-cuenta" ? "page" : undefined}>Mi cuenta</Link>
            <button type="button" onClick={openAssistant}>Asistente</button>
          </div>

          <button className={styles.cartPreview} type="button" aria-label={`Abrir carrito, ${itemCount} ${itemCount === 1 ? "unidad" : "unidades"}`} aria-expanded={isDrawerOpen} aria-controls="cart-drawer" onClick={() => { setIsOpen(false); openCart(); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8.5h13l-1 11h-11l-1-11Z" /><path d="M9 8.5a3 3 0 0 1 6 0" /></svg>
            <span aria-live="polite">{String(itemCount).padStart(2, "0")}</span>
          </button>

          <button className={styles.mobileSearch} type="button" onClick={() => setSearchOpen(true)} aria-label="Buscar productos">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
          </button>
          <button className={styles.menuButton} type="button" aria-expanded={isOpen} aria-controls="mobile-navigation" onClick={() => setIsOpen((current) => !current)}>
            <span>{isOpen ? "Cerrar" : "Menú"}</span><span className={`${styles.menuMark} ${isOpen ? styles.menuMarkOpen : ""}`} aria-hidden="true" />
          </button>
        </div>

        <div id="mobile-navigation" className={`${styles.mobilePanel} ${isOpen ? styles.mobilePanelOpen : ""}`} aria-hidden={!isOpen}>
          <nav className={styles.mobileNav} aria-label="Navegación móvil">
            <p className={styles.mobileLabel}>TIENDA</p>
            <Link className={styles.mobileAll} href="/productos" tabIndex={isOpen ? 0 : -1} onClick={closeMenu}>VER TODO</Link>
            <div className={styles.mobileCategories}>
              {storeNavigation.map((item) => <Link key={item.label} href={item.href} tabIndex={isOpen ? 0 : -1} onClick={closeMenu}>{item.label}</Link>)}
            </div>
            <div className={styles.mobilePrimary}>
              {primaryNavigation.map((item) => <Link key={item.label} href={item.href} tabIndex={isOpen ? 0 : -1} onClick={closeMenu}>{item.label}</Link>)}
            </div>
            <div className={styles.mobileUtilities}>
              <button type="button" tabIndex={isOpen ? 0 : -1} onClick={() => { closeMenu(); setSearchOpen(true); }}>BUSCAR</button>
              <Link href="/mi-cuenta" tabIndex={isOpen ? 0 : -1} onClick={closeMenu}>MI CUENTA</Link>
              <button type="button" tabIndex={isOpen ? 0 : -1} onClick={openAssistant}>ASISTENTE</button>
            </div>
          </nav>
        </div>
      </header>
      <GlobalSearch open={searchOpen} onClose={closeSearch} />
    </>
  );
}
