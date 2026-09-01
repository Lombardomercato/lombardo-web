export type GuideCluster =
  | "Comprar Online Rosario"
  | "Regalos"
  | "Precio"
  | "Ocasiones"
  | "Varietales y destilados"
  | "Aprender"
  | "Quedar Bien";

export interface GuideSection {
  eyebrow: string;
  title: string;
  paragraphs: readonly string[];
  bullets?: readonly string[];
  quote?: string;
}

export interface GuideCatalogRule {
  mode: "category" | "search" | "search-list" | "price-cap";
  categorySlug: string;
  search?: string;
  searchTerms?: readonly string[];
  priceMax?: number;
  limit: number;
  heading: string;
  description: string;
  allHref: string;
  allLabel: string;
}

export interface GuideDefinition {
  slug: string;
  cluster: GuideCluster;
  intent: "informacional" | "comercial" | "transaccional";
  title: string;
  titleLines: readonly string[];
  cardTitle: string;
  description: string;
  eyebrow: string;
  dek: string;
  intro: string;
  readingMinutes: number;
  publishedAt: string;
  updatedAt: string;
  heroImage?: string;
  heroAlt?: string;
  heroCaption?: string;
  momentImage?: string;
  momentAlt?: string;
  heroTone: "blue" | "red" | "green" | "pink" | "beige";
  visualCaptions: readonly [string, string];
  sections: readonly GuideSection[];
  catalog: GuideCatalogRule;
  relatedSlugs: readonly string[];
  featured: boolean;
}

export const GUIDE_CLUSTERS = [
  { name: "Ocasiones", description: "La botella correcta para la mesa que tenés adelante." },
  { name: "Precio", description: "Selecciones honestas que se actualizan con el catálogo real." },
  { name: "Aprender", description: "Varietales y estilos explicados sin examen de sommelier." },
  { name: "Regalos", description: "Criterio para elegir algo que no parezca elegido a las apuradas." },
  { name: "Quedar Bien", description: "Decisiones simples para invitaciones, festejos y gestos." },
  { name: "Comprar Online Rosario", description: "Catálogo vivo y contexto local cuando de verdad ayuda." },
] as const;

const EDITORIAL_GUIDES: readonly GuideDefinition[] = [
  {
    slug: "que-vino-llevar-a-una-cena",
    cluster: "Ocasiones",
    intent: "comercial",
    title: "Te invitaron a comer. ¿Qué vino llevás?",
    titleLines: ["Te invitaron", "a comer.", "¿Qué vino llevás?"],
    cardTitle: "Te invitaron a comer. ¿Qué vino llevás?",
    description: "Una guía directa para elegir qué vino llevar a una cena y acertar sin conocer el menú completo.",
    eyebrow: "OCASIONES / MESA AJENA",
    dek: "No hace falta adivinar la receta ni llegar con la botella más cara. Hace falta leer la invitación y elegir un vino que sepa acompañar.",
    intro: "Hay una diferencia entre llevar vino y llevar un vino bien elegido. La primera opción resuelve una obligación. La segunda dice que prestaste atención. Para lograrlo no necesitás una cava propia: con tres datos —qué tan formal es la comida, cuánta gente habrá y cuándo se va a abrir la botella— ya podés decidir bastante bien.",
    readingMinutes: 6,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-30",
    heroImage: "/images/guides/que-vino-llevar-a-una-cena.jpg",
    heroAlt: "Una persona entrega una botella envuelta al llegar a una cena",
    heroCaption: "Llegar con una botella no es adivinar el menú: es leer la invitación.",
    heroTone: "blue",
    visualCaptions: [
      "La botella que llevás no tiene que dominar la mesa: tiene que abrirla.",
      "Si dudás entre impresionar y acompañar, casi siempre conviene acompañar.",
    ],
    sections: [
      {
        eyebrow: "01 / LEÉ LA INVITACIÓN",
        title: "Primero la escena. Después la etiqueta.",
        paragraphs: [
          "¿Es un martes entre amigos o una cena que alguien viene planeando hace semanas? En una mesa informal funciona un vino expresivo, fácil de compartir y sin demasiada ceremonia. Si la invitación tiene otra intención —aniversario, primera visita, festejo— la presentación y la historia de la botella empiezan a pesar más.",
          "No conocer el menú no es un problema. Evitá los extremos: ni el tinto más alcohólico y concentrado, ni un blanco tan filoso que exija un plato preciso. Un Malbec fresco, un blend equilibrado, un Pinot Noir amable o un Chardonnay sin exceso de madera cubren muchísimo terreno.",
        ],
        quote: "La mejor botella para llevar es la que hace fácil servir una segunda copa.",
      },
      {
        eyebrow: "02 / HACÉ UNA PREGUNTA",
        title: "Preguntar qué comen no arruina la sorpresa.",
        paragraphs: [
          "Un simple “¿qué van a cocinar?” alcanza. Si aparece parrilla, pensá en tintos con fruta y frescura antes que en potencia pura. Para pastas con salsa roja, Sangiovese, Bonarda o un corte de tintas suelen conversar mejor con el tomate. Para pescados, vegetales o una mesa de picoteo, blancos, rosados y espumantes dan aire.",
          "Si la respuesta es “traé lo que quieras”, tomala en serio: elegí algo que a vos te gustaría abrir. La recomendación más convincente siempre viene con una frase concreta —“lo probé y es muy fresco”, “va buenísimo apenas frío”—, no con una clase de geografía vitivinícola en la puerta.",
        ],
        bullets: ["Parrilla: fruta, frescura y taninos amables.", "Pastas: acidez suficiente para acompañar la salsa.", "Picoteo: blancos, rosados, espumantes o tintos livianos."],
      },
      {
        eyebrow: "03 / CANTIDAD Y TEMPERATURA",
        title: "Una botella cada dos o tres personas.",
        paragraphs: [
          "Una botella sirve unas cinco copas generosas. Si son seis y sabés que el vino va a tener protagonismo, llevar dos evita que la elegida desaparezca en la primera ronda. Pueden ser iguales o una dupla con recorrido: un blanco para empezar y un tinto para la comida.",
          "En Rosario, además, la temperatura importa casi todo el año. Un tinto que pasó horas en el auto llega derrotado. Diez o quince minutos de heladera antes de salir ayudan incluso a los tintos. El objetivo no es servirlos fríos: es que no lleguen calientes.",
        ],
      },
      {
        eyebrow: "04 / EL GESTO",
        title: "No obligues a abrirla.",
        paragraphs: [
          "Entregá la botella como regalo, no como parte del menú que exige servicio inmediato. Quien cocina quizá ya armó su secuencia o recibió otros vinos. Decir “esto es para ustedes; si no entra hoy, queda para otro día” libera al anfitrión y mejora el gesto.",
          "Si querés gastar un poco más, buscá identidad antes que tamaño: una bodega interesante, una región menos obvia o una presentación cuidada. El precio puede sumar, pero nunca reemplaza la elección.",
        ],
      },
    ],
    catalog: { mode: "category", categorySlug: "vinos", limit: 3, heading: "3 botellas que elegiríamos", description: "Tres puntos de partida para mesas distintas, con precio y disponibilidad consultados ahora en Runia.", allHref: "/categorias/vinos", allLabel: "Ver todos los vinos" },
    relatedSlugs: ["regalar-vino-sin-saber-de-vino", "vino-para-asado-no-siempre-malbec"],
    featured: true,
  },
  {
    slug: "vinos-por-menos-de-20000",
    cluster: "Precio",
    intent: "transaccional",
    title: "10 vinos por menos de $20.000 que compraríamos hoy",
    titleLines: ["10 vinos", "por menos", "de $20.000", "que", "compraríamos", "hoy"],
    cardTitle: "10 vinos por menos de $20.000 que compraríamos hoy",
    description: "Diez vinos de buena relación precio-calidad por menos de $20.000, seleccionados con precios vivos del catálogo Lombardo.",
    eyebrow: "PRECIO / CATÁLOGO VIVO",
    dek: "El precio es un dato que cambia. El criterio no: buscamos botellas honestas, con identidad y ganas de volver a abrirlas.",
    intro: "Una lista de precio-calidad sólo sirve si cumple dos cosas: los vinos existen y los precios son los de hoy. Esta selección no está pegada a un número viejo. Se arma con el catálogo SAFE de Lombardo y muestra únicamente botellas cuyo precio vigente está debajo de $20.000. Si una sale del rango o deja de estar disponible, otra ocupa su lugar.",
    readingMinutes: 5,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-30",
    heroImage: "/images/guides/vinos-por-menos-de-20000.jpg",
    heroAlt: "Diez botellas sin marca reunidas sobre una mesa de selección",
    heroCaption: "Diez lugares, siempre ocupados por botellas disponibles y dentro del rango.",
    heroTone: "red",
    visualCaptions: ["Precio-calidad no significa barato: significa que cada peso aparece en la copa.", "Diez lugares, siempre ocupados por botellas disponibles y dentro del rango."],
    sections: [
      {
        eyebrow: "01 / NUESTRO FILTRO",
        title: "Que dé más de lo que promete.",
        paragraphs: [
          "No buscamos la etiqueta con mayor descuento ni la ficha técnica más ruidosa. Buscamos vinos con una idea clara: fruta nítida, equilibrio, una textura agradable y un final que no se desarme. En este rango, la consistencia vale más que la grandilocuencia.",
          "También importa la versatilidad. Un buen vino de todos los días debería funcionar con comida y sin ella, poder servirse un poco fresco y no pedir una ocasión solemne. Son botellas para tener a mano, no para postergar indefinidamente.",
        ],
      },
      {
        eyebrow: "02 / CÓMO LEER LA LISTA",
        title: "No están ordenados del mejor al peor.",
        paragraphs: [
          "El primero no le gana al décimo. Cada botella resuelve algo distinto: una comida improvisada, una pizza, una picada, una charla larga o el vino de la semana. Abrí la ficha para ver marca, presentación y disponibilidad actual; el orden puede cambiar cuando cambia el catálogo.",
          "Si comprás varias, combiná estilos. Dos tintos diferentes y un blanco bien elegido rinden más que tres variaciones mínimas del mismo Malbec. La relación precio-calidad también aparece cuando una compra te da opciones.",
        ],
        quote: "Una gran compra no es la que cuesta menos. Es la que no te hace pensar que deberías haber elegido otra cosa.",
      },
      {
        eyebrow: "03 / TEMPERATURA",
        title: "Antes de culpar al vino, enfriá la botella.",
        paragraphs: [
          "Muchos tintos económicos parecen más pesados porque se sirven demasiado calientes. Quince minutos en la heladera ordenan el alcohol y devuelven la fruta. Los blancos tampoco necesitan congelarse: demasiado frío borra aromas y textura.",
          "Una copa común, limpia y sin perfume de detergente hace el resto. No hay que convertir una botella cotidiana en un ritual, pero sí darle una oportunidad justa.",
        ],
      },
      {
        eyebrow: "04 / LA REGLA HONESTA",
        title: "Hoy quiere decir hoy.",
        paragraphs: [
          "Los diez productos de abajo se consultan contra Runia al abrir la página. El tope se aplica al precio que ves y sólo entran productos SAFE. Por eso esta nota puede seguir siendo útil después de su publicación sin reescribir el artículo cada vez que una lista cambia.",
          "Si encontrás una botella que te interesa, confirmá en su ficha y sumala desde acá. El precio del carrito vuelve a validarse con el catálogo antes de la compra.",
        ],
      },
    ],
    catalog: { mode: "price-cap", categorySlug: "vinos", priceMax: 20000, limit: 10, heading: "La selección Lombardo: los 10 de hoy", description: "Todos debajo de $20.000 al cargar esta página. Si el precio cambia, cambia la selección.", allHref: "/categorias/vinos", allLabel: "Explorar todos los vinos" },
    relatedSlugs: ["que-vino-llevar-a-una-cena", "malbec-7-botellas-para-entenderlo"],
    featured: true,
  },
  {
    slug: "malbec-7-botellas-para-entenderlo",
    cluster: "Aprender",
    intent: "comercial",
    title: "Malbec: 7 botellas para entender por qué no todos saben igual",
    titleLines: ["Malbec:", "7 botellas", "para entender", "por qué no todos", "saben igual"],
    cardTitle: "Malbec: 7 botellas para entender por qué no todos saben igual",
    description: "Siete Malbec argentinos para reconocer diferencias de lugar, altura, cosecha y estilo sin convertir la copa en un examen.",
    eyebrow: "APRENDER / MALBEC",
    dek: "Decir “me gusta el Malbec” es apenas el comienzo. La misma uva puede ser violeta, hierbas, ciruela, piedra, tensión o terciopelo.",
    intro: "El Malbec se volvió familiar, y esa familiaridad a veces lo aplana: parece que todas las botellas deberían saber a lo mismo. No. Cambian el lugar, la altura, el momento de cosecha, el tipo de suelo, el uso de madera y la intención de quien hace el vino. Probarlos uno al lado del otro es la manera más rápida —y más entretenida— de verlo.",
    readingMinutes: 7,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-30",
    heroImage: "/images/guides/malbec-7-botellas-para-entenderlo.jpg",
    heroAlt: "Siete copas de Malbec frente a un paisaje de montaña al atardecer",
    heroCaption: "Una uva, muchos paisajes: el lugar aparece cuando las copas se prueban juntas.",
    heroTone: "pink",
    visualCaptions: ["Una uva, muchos paisajes: el lugar aparece cuando las botellas se prueban juntas.", "No busques la respuesta correcta. Buscá la diferencia que podés nombrar."],
    sections: [
      {
        eyebrow: "01 / EMPEZÁ POR DOS",
        title: "Comparar enseña más que memorizar.",
        paragraphs: [
          "Abrí dos botellas de zonas o estilos distintos y servilas sin mirar la etiqueta. En una quizá aparezca fruta madura y una textura ancha; en otra, perfume floral, nervio y un final más seco. Ninguna necesita ser “mejor”. Lo interesante es descubrir cuál te pide otra copa y con qué comida la imaginás.",
          "Usá la misma copa, la misma temperatura y porciones chicas. Volvé a probarlas después de veinte minutos. El aire cambia el vino y también cambia tu lectura.",
        ],
      },
      {
        eyebrow: "02 / EL LUGAR",
        title: "Mendoza no es un solo sabor.",
        paragraphs: [
          "Luján de Cuyo suele ofrecer perfiles generosos y redondos; el Valle de Uco puede sumar tensión, hierbas, violetas y una sensación mineral difícil de resumir en una sola palabra. Salta, Patagonia y otras zonas agregan alturas, climas y texturas propias.",
          "La región de la etiqueta orienta, pero no sentencia. Dos productores vecinos pueden tomar decisiones opuestas. Pensá el origen como una pista y no como una garantía automática.",
        ],
        quote: "El terroir se entiende mejor como una diferencia en la copa que como una palabra en la contraetiqueta.",
      },
      {
        eyebrow: "03 / LA MANO",
        title: "Cosecha, madera y extracción.",
        paragraphs: [
          "Uvas cosechadas más temprano suelen conservar acidez y notas frescas; más tarde, ganan madurez y volumen. La crianza puede sumar especias, tostado y textura. La extracción —cuánto se trabaja con pieles y semillas— define parte del color y del agarre del vino.",
          "La madera no es un premio. Bien usada integra; en exceso tapa. Lo mismo vale para la concentración: un Malbec liviano puede ser tan serio como uno enorme. El estilo tiene que cerrar sobre sí mismo.",
        ],
        bullets: ["Fruta roja o negra: una primera pista de madurez.", "Acidez: la energía que sostiene la copa.", "Tanino: la textura, no un sinónimo de calidad.", "Madera: un marco; nunca debería borrar el vino."],
      },
      {
        eyebrow: "04 / LA DEGUSTACIÓN",
        title: "Siete botellas, una conversación.",
        paragraphs: [
          "No hace falta abrir las siete el mismo día. Armá tres momentos: dos jóvenes y frutados, dos con mayor crianza y tres de orígenes diferentes. Guardá una foto de las etiquetas y una frase por botella. “Más fresco”, “más ancho”, “perfume a violetas” alcanza.",
          "Al final no deberías tener un ranking sino un mapa propio. La próxima vez que elijas Malbec, vas a pedir un estilo y no solamente una uva.",
        ],
      },
    ],
    catalog: { mode: "search", categorySlug: "vinos", search: "malbec", limit: 7, heading: "7 Malbec para probar el mapa", description: "Botellas SAFE disponibles ahora para probar diferencias reales de productor y estilo.", allHref: "/categorias/vinos?buscar=malbec", allLabel: "Ver más Malbec" },
    relatedSlugs: ["vino-para-asado-no-siempre-malbec", "vinos-por-menos-de-20000"],
    featured: true,
  },
  {
    slug: "regalar-vino-sin-saber-de-vino",
    cluster: "Regalos",
    intent: "comercial",
    title: "Regalar vino sin saber de vino. Una guía para quedar bien.",
    titleLines: ["Regalar vino", "sin saber", "de vino.", "Una guía para", "quedar bien."],
    cardTitle: "Regalar vino sin saber de vino",
    description: "Cómo elegir vinos para regalar sin conocer etiquetas: presupuesto, estilo, presentación y entrega en Rosario.",
    eyebrow: "REGALOS / QUEDAR BIEN",
    dek: "No necesitás saber de añadas. Necesitás saber algo de la persona: cómo disfruta, con quién comparte y qué querés decirle.",
    intro: "El miedo más común al regalar vino es elegir “mal”. En realidad, una botella rara vez falla por su cepa. Falla cuando parece automática: la más cara del estante, la etiqueta más solemne o cualquier Malbec porque “a todo el mundo le gusta”. Un buen regalo empieza por el destinatario y termina con una presentación cuidada.",
    readingMinutes: 6,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-30",
    heroImage: "/images/guides/regalar-vino-sin-saber-de-vino.jpg",
    heroAlt: "Una botella sin marca se envuelve con papel coral junto a una caja azul",
    heroCaption: "El envoltorio abre el regalo. El criterio termina de entregarlo.",
    heroTone: "green",
    visualCaptions: ["Una botella elegida con una razón vale más que una botella elegida por precio.", "El envoltorio abre el regalo. La historia termina de entregarlo."],
    sections: [
      {
        eyebrow: "01 / TRES PREGUNTAS",
        title: "Persona, momento, presupuesto.",
        paragraphs: [
          "¿Toma vino seguido o esto es una invitación a descubrir? ¿Lo va a abrir en una cena, guardar o compartir en un festejo? ¿Cuánto querés gastar sin que el precio se convierta en el único argumento? Con esas respuestas ya se descarta la mitad del catálogo.",
          "Para alguien curioso, una región o uva menos obvia puede ser un gran gesto. Para quien tiene gustos clásicos, una muy buena versión de su estilo favorito gana. Si no sabés nada, buscá versatilidad y una presentación que se sienta completa.",
        ],
      },
      {
        eyebrow: "02 / EL PRESUPUESTO",
        title: "Subir de precio no siempre afina la elección.",
        paragraphs: [
          "Definí un rango antes de mirar etiquetas. Eso permite comparar vinos que compiten en condiciones parecidas y evita que una recomendación se transforme en una escalera infinita. Dentro de cada rango hay botellas con identidad, no sólo opciones de compromiso.",
          "Si el regalo es importante, una dupla bien pensada suele decir más que una única botella inflada: dos regiones, dos estilos o un vino para empezar y otro para la mesa. Para empresas o varios destinatarios, la coherencia de la selección y la entrega pesa más que la extravagancia.",
        ],
        quote: "El lujo del regalo está en que parezca pensado para esa persona.",
      },
      {
        eyebrow: "03 / LA PRESENTACIÓN",
        title: "Que se vea bien sin disfrazarse.",
        paragraphs: [
          "Una caja limpia, una tarjeta breve y el nombre correcto. No hace falta sumar adornos hasta ocultar la botella. La presentación Lombardo funciona mejor cuando mantiene el foco en el producto y deja claro quién lo eligió.",
          "Escribí una línea que explique el criterio: “para la próxima mesa larga”, “para brindar por lo que viene”, “elegimos dos estilos para que compares”. Esa frase convierte un producto en un gesto.",
        ],
      },
      {
        eyebrow: "04 / ROSARIO",
        title: "La coordinación también habla de vos.",
        paragraphs: [
          "Si el regalo se entrega en Rosario, confirmá dirección, teléfono de quien recibe y franja posible. Para una fecha exacta, no dejes la coordinación para el último momento. En regalos empresariales, armá la lista de destinos antes de cerrar productos.",
          "Las botellas sugeridas debajo salen del catálogo actual. Si una deja de ser SAFE, no queda un enlace roto: la selección se actualiza. Si necesitás varias unidades o una presentación específica, hablá con Lombardo antes de confirmar.",
        ],
      },
    ],
    catalog: { mode: "category", categorySlug: "vinos", limit: 3, heading: "3 botellas para regalar con una razón", description: "Puntos de partida con precio y disponibilidad actuales. La elección final la completa la persona.", allHref: "/categorias/regalos", allLabel: "Ver regalos" },
    relatedSlugs: ["que-vino-llevar-a-una-cena", "vinos-por-menos-de-20000"],
    featured: true,
  },
  {
    slug: "vino-para-asado-no-siempre-malbec",
    cluster: "Ocasiones",
    intent: "comercial",
    title: "El asado no pide siempre Malbec",
    titleLines: ["El asado", "no pide siempre", "Malbec"],
    cardTitle: "El asado no pide siempre Malbec",
    description: "Qué vino tomar con asado según el corte, el fuego, las achuras y la mesa: alternativas al Malbec que funcionan de verdad.",
    eyebrow: "OCASIONES / ASADO",
    dek: "El fuego no cocina una sola cosa. Un vacío, una molleja y un provoleta no deberían obligar a la misma botella.",
    intro: "Malbec y asado forman una pareja querida, pero convertirla en regla nos hace perder vinos buenísimos. El maridaje no depende de la nacionalidad del menú: depende de grasa, cocción, textura, sal, salsas y ritmo de la comida. En una parrilla completa hay varias escenas, y se puede elegir una botella para cada una o una muy versátil para atravesarlas.",
    readingMinutes: 7,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-30",
    heroImage: "/images/guides/vino-para-asado-no-siempre-malbec.jpg",
    heroAlt: "Una mesa de asado al anochecer con copas, comida y fuego de parrilla",
    heroCaption: "En la mesa del asado, la frescura puede importar más que la potencia.",
    heroTone: "beige",
    visualCaptions: ["La parrilla tiene humo, grasa, sal y texturas. El vino necesita frescura, no sólo fuerza.", "Un tinto apenas refrescado puede cambiar por completo la mesa del asado."],
    sections: [
      {
        eyebrow: "01 / ANTES DE LA CARNE",
        title: "Achuras y provoleta piden otra energía.",
        paragraphs: [
          "Mollejas, chorizo y provoleta combinan grasa, sal y tostado. Un espumante seco, un blanco con cuerpo o un rosado con buena acidez limpian el paladar y mantienen viva la primera parte de la comida. También evitan empezar con el vino más pesado antes de que llegue el corte principal.",
          "Si querés tinto desde el comienzo, probá uno liviano y fresco: Pinot Noir, Criolla, Garnacha o una Bonarda jugosa. Servilo entre 13 y 15 grados. No es una concesión; es una forma de que la fruta no quede tapada por el calor.",
        ],
      },
      {
        eyebrow: "02 / EL CORTE",
        title: "No toda carne tiene la misma intensidad.",
        paragraphs: [
          "Vacío y entraña agradecen tintos con fruta, acidez y tanino moderado. Un Cabernet Franc herbal, un Syrah especiado o una Bonarda vibrante pueden ser más precisos que un vino excesivamente maduro. Para costilla o cortes con larga cocción, hay más margen para estructura y crianza.",
          "El punto también cambia la elección. Cuanto más jugosa la carne, más fácil se integra un tanino firme; cuanto más cocida, más conviene cuidar la sequedad. Y si aparece chimichurri intenso, buscá frescura: competir con más potencia suele empeorar todo.",
        ],
        quote: "Con asado, la frescura hace el trabajo que muchas veces atribuimos a la potencia.",
      },
      {
        eyebrow: "03 / OTRAS BOTELLAS",
        title: "Cabernet Franc, Bonarda, Syrah y blends.",
        paragraphs: [
          "Cabernet Franc aporta hierbas y tensión; Bonarda, fruta y fluidez; Syrah, especias y un registro ahumado que conversa naturalmente con el fuego. Los blends pueden reunir estructura y frescura sin obligarte a elegir una sola cepa.",
          "Hasta un Chardonnay con cuerpo puede acompañar pollo a la parrilla, vegetales quemados o una provoleta. El color del vino no tiene que copiar el color de la carne. Tiene que equilibrar el plato.",
        ],
        bullets: ["Vacío o entraña: Bonarda, Cabernet Franc, blends frescos.", "Costilla: tintos con más estructura y tiempo.", "Mollejas y provoleta: espumante, Chardonnay o rosado.", "Vegetales al fuego: blancos con textura o tintos livianos."],
      },
      {
        eyebrow: "04 / SERVICIO",
        title: "El enemigo es el tinto a treinta grados.",
        paragraphs: [
          "En una mesa al lado de la parrilla, la botella sube de temperatura rápido. Mantenela a la sombra y usá una frapera con agua y poco hielo si hace calor. Un tinto a 15 o 16 grados va a llegar perfecto a la copa; uno servido a temperatura ambiente en verano pierde definición.",
          "Si son varias personas, la mejor experiencia puede ser abrir dos estilos y probar. El asado dura. Dejá que el vino cambie con la mesa en lugar de buscar una única respuesta universal.",
        ],
      },
    ],
    catalog: { mode: "search-list", categorySlug: "vinos", searchTerms: ["cabernet franc", "bonarda", "syrah", "pinot noir", "blend", "chardonnay", "rose", "espumante"], limit: 3, heading: "3 botellas para poner junto al fuego", description: "Una selección actual para salir del piloto automático. Probá estilos, no sólo etiquetas.", allHref: "/categorias/vinos", allLabel: "Ver todos los vinos" },
    relatedSlugs: ["malbec-7-botellas-para-entenderlo", "que-vino-llevar-a-una-cena"],
    featured: true,
  },
] as const;

const FOUNDATION_GUIDES: readonly GuideDefinition[] = [
  {
    slug: "comprar-vinos-online-rosario",
    cluster: "Comprar Online Rosario",
    intent: "transaccional",
    title: "Guía para comprar vinos online en Rosario",
    titleLines: ["Guía para", "comprar vinos", "online en Rosario"],
    cardTitle: "Comprar vinos online en Rosario",
    description: "Cómo recorrer catálogo y precios actualizados, elegir por ocasión y comprar vinos online en Rosario sin vueltas.",
    eyebrow: "COMPRAR ONLINE / ROSARIO",
    dek: "Comprar vino online debería ahorrar tiempo, no trasladar la indecisión a otra pantalla.",
    intro: "En Lombardo podés recorrer una selección amplia, comparar precios vigentes y entrar por categoría, producto u ocasión. Esta guía reúne lo importante para elegir con criterio y terminar la compra sin vueltas desde Rosario.",
    readingMinutes: 4,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-29",
    heroTone: "blue",
    visualCaptions: ["Elegí desde la ocasión para reducir opciones de manera útil.", "Precio, presentación y disponibilidad se consultan en el catálogo actual."],
    sections: [
      { eyebrow: "01", title: "Empezá por la ocasión", paragraphs: ["Para un asado suele funcionar un tinto versátil; para una mesa liviana conviene mirar blancos, rosados o espumantes; para regalar, la presentación pesa tanto como el varietal. Elegir desde el uso evita comprar sólo por una marca conocida."] },
      { eyebrow: "02", title: "Compará lo disponible", paragraphs: ["Las listas estáticas envejecen rápido. Abrí las fichas para revisar marca, presentación, precio y estado antes de sumar al carrito. Si ya sabés qué buscás, el catálogo permite ir directo por nombre o SKU."] },
      { eyebrow: "03", title: "Coordiná la entrega", paragraphs: ["Armá el carrito y elegí envío a Rosario o a Pueblo Esther, Lagos o Alvear. El día y horario se coordinan con cada comprador. Si el pedido es para una fecha especial, dejá margen para organizarlo."] },
    ],
    catalog: { mode: "category", categorySlug: "vinos", limit: 8, heading: "Vinos disponibles ahora", description: "Catálogo SAFE con precios actuales.", allHref: "/categorias/vinos", allLabel: "Ver vinos" },
    relatedSlugs: ["que-vino-llevar-a-una-cena", "vinos-por-menos-de-20000"],
    featured: false,
  },
  {
    slug: "regalos-empresariales-rosario",
    cluster: "Regalos",
    intent: "comercial",
    title: "Regalos empresariales con vino en Rosario",
    titleLines: ["Regalos", "empresariales", "con vino", "en Rosario"],
    cardTitle: "Regalos empresariales en Rosario",
    description: "Criterio y selección actual para regalos empresariales con vino en Rosario: clientes, equipos y fechas especiales.",
    eyebrow: "REGALOS / EMPRESAS",
    dek: "Un regalo empresarial tiene que sentirse elegido y, al mismo tiempo, ser posible de resolver a escala.",
    intro: "Lombardo combina una selección online de vinos y cosas buenas con coordinación para empresas en Rosario. Esta guía ayuda a definir destinatarios, presupuesto y entrega antes de confirmar cantidades y presentaciones.",
    readingMinutes: 4,
    publishedAt: "2026-08-29",
    updatedAt: "2026-08-31",
    heroImage: "/images/guides/regalos-empresariales-rosario-editorial-v2.jpg",
    heroAlt: "Dos cajas de regalo empresariales azules con vino y objetos gourmet sobre una escenografía coral",
    heroCaption: "Una selección coherente convierte muchas entregas en un gesto que sigue sintiéndose personal.",
    momentImage: "/images/guides/regalos-empresariales-rosario-moment-v2.jpg",
    momentAlt: "Manos terminan un regalo empresarial con cinta verde, papel coral y una botella dentro de una caja azul",
    heroTone: "green",
    visualCaptions: ["Primero definí a quién querés reconocer.", "La entrega también forma parte del regalo."],
    sections: [
      { eyebrow: "01", title: "Definí destinatarios", paragraphs: ["No es lo mismo agradecer a un cliente clave que resolver un detalle para todo un equipo. Separá destinatarios, cantidad y contexto para construir niveles de regalo sin que el resultado parezca genérico."] },
      { eyebrow: "02", title: "Trabajá con un presupuesto real", paragraphs: ["Tomá la selección actual como punto de partida y consultá por cantidad, presentación y coordinación. Para pedidos grandes, precio final y disponibilidad necesitan confirmación."] },
      { eyebrow: "03", title: "Prepará la entrega", paragraphs: ["Fecha, cantidad de destinos, mensaje y persona de contacto importan tanto como la botella. Con ocasión, tipo de destinatario y rango por regalo alcanza para empezar una conversación concreta."] },
    ],
    catalog: { mode: "category", categorySlug: "vinos", limit: 8, heading: "Botellas para empezar a elegir", description: "Disponibilidad y precios consultados ahora.", allHref: "/categorias/regalos", allLabel: "Ver regalos" },
    relatedSlugs: ["regalar-vino-sin-saber-de-vino", "vinos-por-menos-de-20000"],
    featured: false,
  },
] as const;

export const FEATURED_GUIDES = EDITORIAL_GUIDES;
export const PUBLISHED_GUIDES: readonly GuideDefinition[] = [
  ...EDITORIAL_GUIDES,
  ...FOUNDATION_GUIDES,
];

export function getGuide(slug: string) {
  return PUBLISHED_GUIDES.find((guide) => guide.slug === slug) ?? null;
}

export function getRelatedGuides(guide: GuideDefinition) {
  return guide.relatedSlugs.flatMap((slug) => {
    const related = getGuide(slug);
    return related ? [related] : [];
  });
}

export function hasGuideQuality(guide: GuideDefinition, productCount: number) {
  const editorialLength = [
    guide.intro,
    guide.dek,
    ...guide.sections.flatMap((section) => [
      section.title,
      ...section.paragraphs,
      ...(section.bullets ?? []),
      section.quote ?? "",
    ]),
  ].join(" ").length;

  const minimumCopy = guide.featured ? 2_400 : 700;
  return (
    productCount >= guide.catalog.limit &&
    guide.sections.length >= 3 &&
    editorialLength >= minimumCopy
  );
}
