export interface SeoCategory {
  slug: string;
  name: string;
  title: string;
  description: string;
  heroTitle: readonly [string, string];
  heroDescription: readonly [string, string];
}

export const SEO_CATEGORIES: readonly SeoCategory[] = [
  {
    slug: "vinos",
    name: "Vinos",
    title: "Vinos online en Rosario: catálogo y precios",
    description:
      "Comprá vinos online en Rosario con catálogo y precios actualizados. Tintos, blancos, rosados y espumantes para regalar o compartir.",
    heroTitle: ["VINOS", "ONLINE."],
    heroDescription: [
      "Tintos, blancos, rosados y espumantes.",
      "Elegí online y coordiná tu entrega en Rosario.",
    ],
  },
  {
    slug: "destilados",
    name: "Destilados",
    title: "Comprar destilados online en Rosario",
    description:
      "Gin, whisky, aperitivos y otros destilados para comprar online en Rosario con precios actualizados.",
    heroTitle: ["DESTILADOS", "ONLINE."],
    heroDescription: [
      "Gin, whisky, aperitivos y más.",
      "Opciones para el bar, la mesa o un buen regalo.",
    ],
  },
  {
    slug: "cervezas",
    name: "Cervezas",
    title: "Comprar cervezas online en Rosario",
    description:
      "Comprá cervezas online en Rosario y encontrá opciones disponibles con precios actualizados.",
    heroTitle: ["CERVEZAS", "ONLINE."],
    heroDescription: [
      "Opciones para compartir y tener a mano.",
      "Catálogo online con precios actualizados.",
    ],
  },
  {
    slug: "sin-alcohol",
    name: "Sin alcohol",
    title: "Comprar bebidas sin alcohol online en Rosario",
    description:
      "Bebidas sin alcohol para comprar online en Rosario con catálogo y precios actualizados.",
    heroTitle: ["SIN ALCOHOL", "ONLINE."],
    heroDescription: [
      "Buenas opciones para todos los brindis.",
      "Comprá online con precios actualizados.",
    ],
  },
  {
    slug: "gourmet",
    name: "Gourmet",
    title: "Productos gourmet online en Rosario",
    description:
      "Comprá productos gourmet online en Rosario para acompañar una botella, armar un regalo o resolver la mesa.",
    heroTitle: ["GOURMET", "ONLINE."],
    heroDescription: [
      "Detalles ricos que completan una buena elección.",
      "Para regalar, compartir o quedártelo.",
    ],
  },
  {
    slug: "regalos",
    name: "Regalos y accesorios",
    title: "Regalos con vino online en Rosario",
    description:
      "Regalos con vino y accesorios para comprar online en Rosario. Opciones para cumpleaños, clientes, equipos y ocasiones especiales.",
    heroTitle: ["REGALOS", "ONLINE."],
    heroDescription: [
      "Opciones para entregar sin vueltas.",
      "Para cumpleaños, clientes y ocasiones especiales.",
    ],
  },
] as const;

export function getSeoCategory(slug: string) {
  return SEO_CATEGORIES.find((category) => category.slug === slug) ?? null;
}
