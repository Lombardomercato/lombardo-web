import type { Metadata } from "next";
import localFont from "next/font/local";
import { CartDrawer } from "@/components/cart/CartDrawer";
import { CartProvider } from "@/components/cart/CartProvider";
import { SalesAssistant } from "@/components/ai/SalesAssistant";
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
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0030-0039,U+0041-005A,U+0061-007A,U+00C0-00D6,U+00D8-00F6,U+00F8-00FF,U+0100-017F",
    },
  ],
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
  declarations: [
    {
      prop: "unicode-range",
      value:
        "U+0041-005A,U+0061-007A,U+00C0-00D6,U+00D8-00F6,U+00F8-00FF,U+0100-017F",
    },
  ],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: "Comprar vinos online en Rosario | LOMBARDO.",
    template: "%s | LOMBARDO.",
  },
  description: SITE.description,
  applicationName: "LOMBARDO.",
  formatDetection: { email: false, address: false, telephone: false },
  verification: process.env.GOOGLE_SITE_VERIFICATION
    ? { google: process.env.GOOGLE_SITE_VERIFICATION }
    : undefined,
  robots:
    process.env.VERCEL_ENV === "production"
      ? {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        }
      : { index: false, follow: false },
  openGraph: {
    type: "website",
    locale: SITE.locale,
    siteName: "LOMBARDO.",
    title: "Comprar vinos, destilados y regalos online en Rosario | LOMBARDO.",
    description: SITE.description,
  },
  twitter: {
    card: "summary_large_image",
    title: "Comprar vinos online en Rosario | LOMBARDO.",
    description: SITE.description,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
          <SalesAssistant />
        </CartProvider>
      </body>
    </html>
  );
}
