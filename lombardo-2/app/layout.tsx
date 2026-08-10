import type { Metadata } from "next";
import localFont from "next/font/local";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { Header } from "@/components/layout/Header";
import { SITE } from "@/lib/config/site";
import "./globals.css";

const gopher = localFont({
  src: [
    {
      path: "../public/fonts/GopherDisplay-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/GopherDisplay-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-gopher",
  fallback: ["Arial", "sans-serif"],
});

const articulat = localFont({
  src: [
    {
      path: "../public/fonts/articulat-regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/articulat-bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
  variable: "--font-articulat",
  fallback: ["Arial", "sans-serif"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "LOMBARDO. | Vinos, regalos y cosas buenas.",
    template: "%s | LOMBARDO.",
  },
  description: SITE.description,
  applicationName: "LOMBARDO.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "LOMBARDO.",
    title: "LOMBARDO. | Quedar bien es fácil.",
    description: SITE.description,
  },
  twitter: {
    card: "summary",
    title: "LOMBARDO. | Quedar bien es fácil.",
    description: SITE.description,
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es-AR"
      data-scroll-behavior="smooth"
      className={`${gopher.variable} ${articulat.variable}`}
    >
      <body>
        <CartProvider>
          <a className="skip-link" href="#main-content">
            Saltar al contenido
          </a>
          <Header />
          <div id="main-content" className="site-content">
            {children}
          </div>
          <CartDrawer />
        </CartProvider>
      </body>
    </html>
  );
}
