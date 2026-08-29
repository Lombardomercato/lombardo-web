# HITO SEO 1 — SEO Foundation + Rosario Market Map

Fecha de auditoría: 2026-08-29  
Dominio canónico: `https://www.lombardomercato.com`  
Baseline de código: `main` en `a3c2a06`

## 1. Baseline real de Production

| Señal | Antes de HITO SEO 1 |
|---|---|
| Home | 200, canonical correcto, index/follow |
| Catálogo | 200, canonical correcto, 24 enlaces de producto en HTML inicial |
| Total de productos SAFE informado | 3.213 |
| Sitemap | 600 bytes, 3 URLs: Home, Productos y Cava Secreta |
| Categorías indexables | 0; se resolvían con `?categoria=` y canonical a `/productos` |
| Product schema | Ausente |
| Organization / OnlineStore schema | Ausente |
| Breadcrumb schema | Ausente |
| OG general | Sin imagen grande; card `summary` |
| Carrito / checkout / login / pedido / admin | `noindex` presente en las páginas auditadas |
| APIs | `X-Robots-Tag` presente sólo en `/api/*` |
| URLs legacy | `/pages/*`, Wine Tinder y HTML antiguos devolvían 404 |
| Search Console | Sin token HTML ni verificación DNS pública de Google; acceso no disponible |
| Merchant Center | Sin feed, credenciales o configuración detectable en repo/Production |
| Rendimiento móvil de laboratorio | 390×844, 4G simulado, CPU ×4: TTFB 153 ms, FCP 2.152 s, LCP 2.236 s, CLS 0; no son datos de campo |
| PageSpeed público | No disponible por cuota 429; no se inventa score |

La Home y el catálogo son dinámicos y responden con caché privada/no-store porque el precio depende del contexto de cliente. Ese punto no se modificó: optimizarlo exige tocar customer pricing y queda fuera de este hito.

## 2. Blockers P0 resueltos en código

- Sitemap escalable con todas las fichas SAFE activas que tienen lista retail, consultadas sin cargar imágenes.
- Seis categorías con URLs limpias: `/categorias/vinos`, `/destilados`, `/cervezas`, `/sin-alcohol`, `/gourmet` y `/regalos`.
- Enlaces internos de Home, header y catálogo apuntando a categorías canónicas en vez de facetas por query.
- Metadata comercial diferenciada para Home, catálogo, categorías, guías y productos.
- Descripciones SEO de producto basadas únicamente en datos reales del catálogo.
- JSON-LD `OnlineStore` en Home, `Product` en ficha y `BreadcrumbList` en categorías, fichas y guías.
- OG image 1200×630 y Twitter large card.
- `robots.txt` protege APIs, conserva el rastreo de páginas con meta `noindex` y declara host/sitemap.
- `X-Robots-Tag` agregado también a `/admin/api/*`.
- Redirects permanentes para el universo legacy conocido.
- Infraestructura `/guias` con registro editorial explícito, catálogo/precios vivos y guardrail anti-thin.
- Dos guías iniciales publicadas, no cientos: compra online Rosario y regalos empresariales.

## 3. Plan de URLs legacy

| Origen | Estado antes | Destino 308 | Motivo |
|---|---:|---|---|
| `/index.html`, `/pages/home` | 404 | `/` | Home canónica |
| `/tienda.html`, `/pages/tienda`, `/carta.html` | 404 | `/productos` | Intención catálogo |
| `/wine-tinder.html`, `/tinder-wine.html`, `/pages/wine-tinder` | 404 | `/categorias/vinos` | Descubrimiento de vinos; no se fuerza Cava Secreta |
| `/sommelier.html`, `/pages/sommelier-ia` | 404 | `/guias` | Intención de asesoramiento |
| `/experiencias.html`, `/pages/experiencias` | 404 | `/guias` | Contenido editorial útil |
| `/club.html`, `/pages/club` | 404 | `/guias` | No existe club equivalente vigente |
| `/contacto.html`, `/pages/contacto` | 404 | `/` | Contacto visible en Home |
| `/pasteleria.html`, `/pages/pasteleria` | 404 | `/categorias/gourmet` | Intención de productos gourmet |
| `/empresas.html`, `/archive/empresas.html`, `/pages/empresas` | 404 | `/guias/regalos-empresariales-rosario` | Intención B2B equivalente |

No se redirige todo `/pages/:path*` a Home: los orígenes desconocidos deben seguir devolviendo 404 para no fabricar soft-404s.

## 4. Mapa competitivo Rosario

| Competidor | Fortaleza visible en SERP | Oportunidad para Lombardo |
|---|---|---|
| [Canaima](https://canaimasabores.com.ar/) | Home escrita para “vinoteca en Rosario” y “venta online de vinos”; categorías indexables | Ganar con mejor intención online, catálogo vivo, metadata y fichas completas |
| [DeCopas](https://decopaswinestore.com/) | Relevancia local, regalos empresariales, catas y dirección física | Lombardo puede apropiarse de la compra online y del B2B resolutivo |
| [Vinos Rosario](https://vinosrosario.com.ar/) | Nombre exact-match y catálogo amplio con precios | Superar en arquitectura, indexación de fichas y contenido de decisión |
| [Bebidas Ros](https://bebidasros.com.ar/) | Landing de Gin y mensaje de envíos local | Crear páginas útiles por destilado con selección actual |
| [Cava Imperial](https://cavaimperial.com.ar/) | Regalos y entregas coordinadas en Rosario | Cluster Regalos + Empresas con producto y copy propio |
| [DR Wine House](https://www.drwinehouse.com.ar/) | Promesa fuerte de entrega en Rosario/Gran Rosario | Comunicar condiciones reales sin promesas desactualizadas |
| [Siddhartha](https://siddharthavinos.mitiendanube.com/) | Tienda simple, precios y entrega local | Mejor profundidad temática e internal linking |
| [Al Vino Vino](https://alvinovino.com/) | Profundidad de catálogo en vinos y destilados | Fichas indexables + navegación por categoría/ocasión/precio |
| [Vinos Notables](https://www.vinosnotables.com.ar/) | Gran surtido y páginas de producto/categoría | Diferenciar por UX, marca, regalos y decisión fácil |

Lectura de mercado:

1. Las SERPs locales están fragmentadas: conviven vinotecas, mayoristas, Tiendanube, nichos de Gin/Whisky y páginas de delivery.
2. Los competidores que aparecen de forma consistente repiten “Rosario”, “vinoteca”, “venta online”, “envíos” y “regalos empresariales” en páginas indexables.
3. Gin y Whisky muestran resultados de categoría específicos; una única página genérica de destilados no alcanza a largo plazo.
4. Regalos empresariales mezcla vinotecas y gift boxes no especializadas: hay espacio para una propuesta de vino + resolución online.
5. La ventaja estructural de Lombardo es el catálogo vivo de Runia. Debe convertirse en páginas útiles, no en combinaciones automáticas sin demanda.

## 5. Primeras 30 páginas / keywords

| # | Pri. | Keyword primaria | Intención | URL objetivo | Internal linking principal | Estado |
|---:|:---:|---|---|---|---|---|
| 1 | P0 | comprar vinos online Rosario | Transaccional local | `/` | Header, categorías, guías | Implementada |
| 2 | P0 | comprar bebidas online Rosario | Transaccional local | `/productos` | Home, header, footer | Implementada |
| 3 | P0 | vinoteca online Rosario | Transaccional local | `/categorias/vinos` | Home, catálogo, guías | Implementada |
| 4 | P0 | comprar destilados online Rosario | Transaccional local | `/categorias/destilados` | Home, catálogo | Implementada |
| 5 | P0 | regalos con vino Rosario | Comercial local | `/categorias/regalos` | Home, guía Empresas | Implementada |
| 6 | P0 | guía comprar vinos online Rosario | Comercial | `/guias/comprar-vinos-online-rosario` | Home, categoría Vinos | Implementada |
| 7 | P0 | regalos empresariales Rosario | Comercial B2B | `/guias/regalos-empresariales-rosario` | Header, Home Empresas | Implementada |
| 8 | P1 | delivery de vinos Rosario | Transaccional local | `/guias/delivery-vinos-rosario` | Home, checkout informativo, Vinos | Backlog |
| 9 | P1 | vinos para regalar | Comercial | `/guias/vinos-para-regalar` | Regalos, productos, ocasiones | Backlog |
| 10 | P1 | qué vino regalar | Informacional comercial | `/guias/que-vino-regalar` | Regalos, vinos para regalar | Backlog |
| 11 | P1 | regalos para clientes Rosario | Comercial B2B | `/guias/regalos-para-clientes-rosario` | Empresas, Regalos | Backlog |
| 12 | P1 | cajas de vino para empresas Rosario | Comercial B2B | `/guias/cajas-de-vino-para-empresas-rosario` | Empresas, Vinos, Regalos | Backlog |
| 13 | P1 | vinos por precio | Comercial | `/guias/vinos-por-precio` | Vinos, guías de presupuesto | Backlog |
| 14 | P1 | vinos por menos de [umbral vigente] | Transaccional | `/guias/vinos-menos-de-[umbral]` | Hub Precio, productos | Backlog programático |
| 15 | P1 | Malbec calidad precio | Comercial | `/guias/malbec-calidad-precio` | Vinos, Malbec, Precio | Backlog |
| 16 | P1 | vinos buenos y baratos | Comercial | `/guias/vinos-buenos-y-baratos` | Precio, Vinos | Backlog |
| 17 | P1 | vino para asado | Comercial | `/guias/vino-para-asado` | Ocasiones, Malbec, Vinos | Backlog |
| 18 | P1 | vino para pastas | Comercial | `/guias/vino-para-pastas` | Ocasiones, varietales | Backlog |
| 19 | P1 | vino para sushi | Comercial | `/guias/vino-para-sushi` | Ocasiones, blancos/rosados | Backlog |
| 20 | P1 | vino para pizza | Comercial | `/guias/vino-para-pizza` | Ocasiones, tintos livianos | Backlog |
| 21 | P1 | qué llevar cuando te invitan a comer | Comercial | `/guias/que-llevar-cuando-te-invitan-a-comer` | Home situaciones, Regalos | Backlog |
| 22 | P1 | vino para cumpleaños | Comercial | `/guias/vino-para-cumpleanos` | Home situaciones, Regalos | Backlog |
| 23 | P1 | comprar Malbec online Rosario | Transaccional local | `/guias/malbec` | Vinos, Precio, ocasiones | Backlog programático |
| 24 | P2 | comprar Cabernet Sauvignon Rosario | Transaccional local | `/guias/cabernet-sauvignon` | Vinos, ocasiones | Backlog programático |
| 25 | P2 | comprar Pinot Noir Rosario | Transaccional local | `/guias/pinot-noir` | Vinos, ocasiones | Backlog programático |
| 26 | P2 | comprar Chardonnay Rosario | Transaccional local | `/guias/chardonnay` | Vinos, sushi/pastas | Backlog programático |
| 27 | P1 | comprar gin Rosario | Transaccional local | `/guias/comprar-gin-rosario` | Destilados, regalos | Backlog programático |
| 28 | P1 | comprar whisky Rosario | Transaccional local | `/guias/comprar-whisky-rosario` | Destilados, regalos | Backlog programático |
| 29 | P2 | aperitivos Rosario | Transaccional local | `/guias/aperitivos-rosario` | Destilados, ocasiones | Backlog programático |
| 30 | P2 | cómo elegir un vino | Informacional comercial | `/guias/como-elegir-un-vino` | Vinos, varietales, ocasiones | Backlog |

No se asigna la misma keyword primaria a Home, categoría y guía. Home captura la compra local principal; la categoría captura “vinoteca online / catálogo”; la guía captura la necesidad de orientación.

## 6. Arquitectura de clusters

```text
Home: comprar online Rosario
├── Categorías transaccionales
│   ├── Vinos
│   ├── Destilados
│   ├── Regalos
│   └── Gourmet / Cervezas / Sin alcohol
└── /guias
    ├── Comprar Online Rosario
    ├── Regalos
    ├── Precio
    ├── Ocasiones
    ├── Varietales y destilados
    ├── Aprender
    └── Quedar Bien
```

Cada guía debe enlazar hacia una categoría, productos reales y dos guías relacionadas. Las categorías enlazan a productos; Home enlaza a categorías y a los dos hubs comerciales prioritarios.

## 7. Programmatic SEO conectado a Runia

Estado: infraestructura lista, generación masiva deshabilitada.

Guardrails implementados:

- Sólo se publica un slug incluido explícitamente en `PUBLISHED_GUIDES`.
- Cada guía necesita al menos tres bloques editoriales únicos y 1.200 caracteres de copy propio.
- Cada página necesita un mínimo de seis productos actuales antes de renderizarse.
- Los productos/precios se leen del catálogo real con la política vigente; no se escriben precios en el artículo.
- El sitemap sólo incluye productos SAFE activos con lista retail.
- No se generan cruces libres `varietal × ocasión × precio × ciudad`.
- Las páginas de umbral nominal requieren vigencia editorial y redirect cuando el presupuesto deja de ser útil; la inflación argentina impide tratarlas como URLs eternas sin revisión.

Antes de escalar:

1. Añadir atributos fiables de varietal, tipo y volumen a la lectura editorial de Runia.
2. Publicar 5–10 páginas P1 y medir 28 días en Search Console.
3. Sólo multiplicar plantillas que demuestren impresiones, catálogo suficiente y conversión asistida.

## 8. Backlog P0 / P1 / P2

### P0 externo — pendiente

- Obtener acceso/propiedad de Google Search Console, verificar dominio y enviar sitemap.
- Crear o conectar Google Merchant Center; validar dominio y políticas comerciales reales.
- Confirmar nombre legal, teléfono, dirección física si aplica, horarios, política de devolución y condiciones de envío antes de ampliar Organization/Merchant schema.
- Ejecutar Rich Results Test y URL Inspection sobre Home, una categoría, una guía y 3 productos en Production.
- Registrar baseline de campo CWV cuando Search Console acumule datos; el laboratorio no sustituye CrUX.

### P1

- Publicar HTML pagination crawlable para que cada producto también tenga camino interno desde categorías, no sólo sitemap.
- Enriquecer fichas con descripción visible, varietal, origen, bodega, volumen y GTIN cuando existan como datos fiables.
- Implementar las páginas 8–23 y 27–28 en lotes pequeños.
- Construir hubs de Precio y Ocasiones con selección viva.
- Añadir shipping/return structured data sólo después de validar políticas reales.
- Medir queries no-brand, CTR, posición, páginas válidas y ventas orgánicas semanalmente.

### P2

- Varietales secundarios y aperitivos.
- Contenido Aprender y Quedar Bien con enlaces comerciales suaves.
- Automatización Runia → propuesta → revisión humana → publicación.
- Merchant feed dedicado si Merchant Center demuestra cobertura incremental frente a schema+crawl.
- Optimización de caché/SSR del catálogo, coordinada con el frente de customer pricing.

## 9. KPIs semanales

- Clics orgánicos no-brand desde Rosario y Gran Rosario.
- Impresiones/posición de las keywords comerciales P0/P1.
- Productos y categorías válidos/indexados, separados de URLs excluidas.
- Errores de Product/Breadcrumb structured data.
- Sesiones orgánicas con `view_item`, `add_to_cart`, checkout y compra.
- Revenue y tasa de conversión orgánica, no cantidad de artículos publicados.

