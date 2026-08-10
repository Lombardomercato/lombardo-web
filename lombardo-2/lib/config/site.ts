const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
const configuredWhatsAppUrl = process.env.NEXT_PUBLIC_WHATSAPP_URL?.trim();

export const SITE = {
  name: "LOMBARDO.",
  url: configuredUrl || "https://www.lombardomercato.com",
  description: "Vinos, regalos y cosas buenas en Rosario. Quedar bien es fácil.",
} as const;

export const SITE_CONTACT = {
  whatsappUrl: configuredWhatsAppUrl || null,
  whatsappStatus: configuredWhatsAppUrl ? "configured" : "pending-confirmation",
  instagramUrl: "https://www.instagram.com/lombardomercato",
} as const;
