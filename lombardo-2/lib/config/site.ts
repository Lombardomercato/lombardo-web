const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const configuredWhatsAppUrl = process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim();

export const SITE = {
  name: "LOMBARDO.",
  alternateName: "Lombardo Mercato",
  url: configuredUrl || "https://www.lombardomercato.com",
  description:
    "Tienda online de vinos, destilados y regalos en Rosario. Catálogo y precios actualizados para comprar sin vueltas.",
  logoPath: "/brand/logo-reducido-azul.png",
  locale: "es_AR",
} as const;

export const SITE_CONTACT = {
  whatsappUrl: configuredWhatsAppUrl || null,
  whatsappStatus: configuredWhatsAppUrl ? "configured" : "pending-confirmation",
  instagramUrl: "https://www.instagram.com/lombardomercato",
} as const;
