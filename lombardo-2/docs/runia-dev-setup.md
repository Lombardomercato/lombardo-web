# Runia Dev: lectura del catálogo real de VINROS

Lombardo usa exclusivamente el proyecto Runia Dev configurado en variables
server-only. `RuniaCommerceProvider` resuelve el proveedor `VINROS` del tenant
`lombardo-dev` y consulta directamente:

- `supplier_products`, con `active = true` y `eligibility_status = safe`;
- `supplier_prices`, únicamente con `price_type = retail`.

No existe un adapter intermedio, un límite Sandbox, un catálogo local ni un fallback.
Los estados `blocked`, `pending_review` y `supplier_only_cost` se filtran en la
consulta y vuelven a validarse al mapear cada fila.

## Datos visibles

El ID de `supplier_products` es el `runia_product_id` estable que viaja también como
`sourceProductId`. SKU, nombre y presentación salen de la fila supplier; el precio es
el `current_price` retail. La capa supplier de VINROS todavía no contiene imágenes,
stock físico, marca ni categoría estructurados:

- sin imagen, `ProductVisual` conserva la gráfica editorial de Lombardo;
- la disponibilidad se comunica como “Disponible por encargo”, sin inventar stock;
- marca y categoría se normalizan de forma determinista desde nombre y prefijo SKU,
  sin crear registros de producto manuales.

## Rendimiento

El catálogo consulta 24 productos por página (máximo 48 por request), incluye conteo
exacto para navegación progresiva y cachea páginas, fichas y revalidaciones de carrito
durante cinco minutos. Búsqueda y categoría se ejecutan en Runia, no sobre una copia
local en el navegador. La respuesta `/api/catalog` expone `Server-Timing` para medir
la lectura completa y el tramo de Runia.

Las variables requeridas siguen documentadas en `.env.example`. La Secret Key nunca
debe usar el prefijo `NEXT_PUBLIC_`.
