export interface GuideSection {
  title: string;
  body: string;
}

export interface GuideDefinition {
  slug: string;
  cluster: "Comprar Online Rosario" | "Regalos";
  intent: "transaccional" | "comercial";
  title: string;
  description: string;
  eyebrow: string;
  intro: string;
  principles: readonly string[];
  sections: readonly GuideSection[];
  catalogCategorySlug: string;
  catalogHeading: string;
  minimumProducts: number;
  updatedAt: string;
}

export const GUIDE_CLUSTERS = [
  {
    name: "Comprar Online Rosario",
    description: "Categorías, entrega y decisiones con intención de compra local.",
  },
  {
    name: "Regalos",
    description: "Personas, empresas y momentos en los que hay que quedar bien.",
  },
  {
    name: "Precio",
    description: "Selecciones verdaderas que se actualizan cuando cambia el catálogo.",
  },
  {
    name: "Ocasiones",
    description: "Qué elegir para una mesa, una invitación o un festejo.",
  },
  {
    name: "Varietales y destilados",
    description: "Páginas de categoría con catálogo vivo y contexto útil.",
  },
  {
    name: "Aprender",
    description: "Respuestas simples para entender y elegir mejor.",
  },
  {
    name: "Quedar Bien",
    description: "La mirada editorial propia de Lombardo aplicada a decisiones reales.",
  },
] as const;

export const PUBLISHED_GUIDES: readonly GuideDefinition[] = [
  {
    slug: "comprar-vinos-online-rosario",
    cluster: "Comprar Online Rosario",
    intent: "transaccional",
    title: "Guía para comprar vinos online en Rosario",
    description:
      "Una forma simple de comprar vinos online en Rosario: catálogo y precios actualizados, opciones para cada ocasión y compra directa.",
    eyebrow: "COMPRAR ONLINE / ROSARIO",
    intro:
      "Comprar vino online debería ahorrar tiempo, no trasladar la indecisión a otra pantalla. En Lombardo podés recorrer una selección amplia, comparar precios vigentes y entrar por categoría, producto u ocasión. Esta guía reúne lo importante para elegir con criterio y terminar la compra sin vueltas desde Rosario.",
    principles: [
      "Catálogo y precios consultados en el momento",
      "Fichas individuales para comparar antes de elegir",
      "Selección pensada para regalar, compartir o guardar",
    ],
    sections: [
      {
        title: "Empezá por la ocasión",
        body:
          "Si no tenés una etiqueta en mente, pensá primero dónde va a aparecer la botella. Para un asado suele funcionar un tinto versátil; para una mesa más liviana conviene mirar blancos, rosados o espumantes; para regalar, la presentación y la historia de la etiqueta pesan tanto como el varietal. Elegir desde el uso reduce opciones de manera útil y evita comprar sólo por una marca conocida.",
      },
      {
        title: "Compará lo que hoy está disponible",
        body:
          "Las listas estáticas envejecen rápido: cambian precios, presentaciones y disponibilidad. Por eso esta página toma productos del catálogo real de Lombardo. Abrí las fichas para revisar marca, presentación, precio y estado antes de sumar al carrito. Si ya sabés qué buscás, el buscador del catálogo permite ir directo por nombre o SKU sin recorrer toda la selección.",
      },
      {
        title: "Comprá online y coordiná en Rosario",
        body:
          "Armá el carrito con las cantidades que necesitás y completá el pedido online. Las condiciones concretas de entrega o retiro se muestran durante la compra según la configuración vigente; no hace falta depender de una promesa vieja escrita en una guía. Si el pedido es para una fecha o un destinatario especial, dejá margen para coordinarlo con tranquilidad.",
      },
    ],
    catalogCategorySlug: "vinos",
    catalogHeading: "Vinos disponibles ahora",
    minimumProducts: 6,
    updatedAt: "2026-08-29",
  },
  {
    slug: "regalos-empresariales-rosario",
    cluster: "Regalos",
    intent: "comercial",
    title: "Regalos empresariales con vino en Rosario",
    description:
      "Ideas y selección actual para regalos empresariales con vino en Rosario: clientes, equipos, aniversarios y fin de año.",
    eyebrow: "REGALOS / EMPRESAS",
    intro:
      "Un regalo empresarial funciona cuando se siente elegido y, al mismo tiempo, es fácil de resolver a escala. Lombardo combina una selección online de vinos y cosas buenas con coordinación para empresas en Rosario. Esta página sirve para definir el criterio del regalo antes de pedir cantidades, presentaciones y entregas.",
    principles: [
      "Opciones para clientes, equipos y fechas especiales",
      "Presupuesto definido por destinatario, no por una lista desactualizada",
      "Selección y coordinación conversadas antes de confirmar volumen",
    ],
    sections: [
      {
        title: "Definí a quién querés reconocer",
        body:
          "No es lo mismo agradecer a un cliente clave que resolver un detalle para todo un equipo. Antes de elegir productos, separá destinatarios, cantidad y contexto. Esa decisión permite construir uno o más niveles de regalo sin que el resultado parezca genérico. También ayuda a decidir si conviene una botella protagonista, una combinación para compartir o una presentación más completa.",
      },
      {
        title: "Trabajá con un presupuesto real",
        body:
          "En un catálogo con precios vivos, los rangos deben calcularse con valores actuales. Tomá la selección que aparece debajo como punto de partida y consultá por cantidad, presentación y coordinación. Para pedidos grandes, el precio final y la disponibilidad necesitan confirmación: así se evita prometer una etiqueta o un importe que cambió antes de cerrar el pedido.",
      },
      {
        title: "La entrega también es parte del regalo",
        body:
          "Fecha, cantidad de destinos, mensaje y persona de contacto importan tanto como la botella. Prepará esa información desde el inicio para que Lombardo pueda proponer una solución coherente. Si todavía no sabés qué elegir, contá la ocasión, el tipo de destinatario y el rango por regalo: alcanza para empezar una conversación concreta y reducir rápidamente las alternativas.",
      },
    ],
    catalogCategorySlug: "vinos",
    catalogHeading: "Botellas para empezar a elegir",
    minimumProducts: 6,
    updatedAt: "2026-08-29",
  },
] as const;

export function getGuide(slug: string) {
  return PUBLISHED_GUIDES.find((guide) => guide.slug === slug) ?? null;
}

export function hasGuideQuality(
  guide: GuideDefinition,
  productCount: number,
) {
  const uniqueCopyLength = [
    guide.intro,
    ...guide.sections.map((section) => `${section.title} ${section.body}`),
  ].join(" ").length;

  return (
    productCount >= guide.minimumProducts &&
    guide.sections.length >= 3 &&
    uniqueCopyLength >= 1200
  );
}
