# LOMBARDO 2.0

Fundación autónoma del nuevo e-commerce B2C de Lombardo.

## Tecnología

- Next.js con App Router
- TypeScript
- ESLint
- CSS global y CSS Modules propios
- Gopher Display y Articulat CF servidas localmente

No utiliza Tailwind, UI kits ni dependencias visuales externas.

## Desarrollo local

Requiere Node.js 20.9 o superior y pnpm.

```bash
pnpm install
pnpm dev
```

Validaciones:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## Configuración

Copiar `.env.example` a `.env.local` cuando sea necesario.

- `NEXT_PUBLIC_SITE_URL`: URL canónica del sitio.
- `NEXT_PUBLIC_WHATSAPP_URL`: enlace completo del WhatsApp oficial usado para coordinar pedidos.
- `NEXT_PUBLIC_PICKUP_ADDRESS`: dirección configurable del retiro.
- `NEXT_PUBLIC_PICKUP_HOURS`: horario configurable del retiro.
- `NEXT_PUBLIC_DELIVERY_COST_MODE`: `FREE`, `FLAT_RATE` o `TO_BE_CONFIRMED`.
- `NEXT_PUBLIC_DELIVERY_FLAT_RATE`: costo entero cuando se usa tarifa fija.

Las variables server-only de Runia y Mercado Pago están documentadas en
`.env.example`. No deben llevar el prefijo `NEXT_PUBLIC_`.

## Comercio

El catálogo, la ficha y la revalidación del carrito consumen `CommerceProvider`.
`RuniaCommerceProvider` es la única implementación activa: lee directamente los
`supplier_products` activos de VINROS cuyo `eligibility_status` es `safe` y une su
precio `retail` vigente. No existe adapter, fallback ni producto local. Catálogo,
ficha y carrito usan la misma lectura server-only.

El primer render entrega 24 productos. Las páginas siguientes, la búsqueda y los
filtros se resuelven en el servidor y se cargan de forma progresiva. Las respuestas
de catálogo se cachean durante cinco minutos; el navegador nunca recibe la clave de
Runia. Como la capa supplier actual no contiene imágenes ni stock físico, Lombardo
usa su gráfica editorial y muestra disponibilidad por encargo.

El checkout crea órdenes mediante `/api/orders`. `RuniaOrderRepository` vuelve a
consultar productos, recalcula importes y persiste snapshots inmutables mediante
`SupabaseOrderStore`. La base protege la idempotencia con restricciones únicas por
tenant, sesión y clave.

La creación de órdenes exige Runia y no tiene fallback al catálogo local. Preview y
Development sólo admiten Runia Dev; Vercel Production exige credenciales separadas de
Runia Production. Los precios del navegador sólo detectan `PRICE_CHANGED`.

Checkout Pro se habilita únicamente con `PAYMENTS_ENABLED=true`, credenciales TEST y
una `APP_URL` HTTPS pública fuera de Production. La guía completa está en
`docs/sandbox-payments.md`; la matriz de lanzamiento está en
`docs/production-readiness.md`.
Antes de una prueba real, `pnpm sandbox:check` debe terminar con
`SANDBOX INFRA READY: YES`.

La modalidad de pago se persiste como un adaptador genérico: `mercado_pago` o
`whatsapp_coordination`. Mercado Pago sigue siendo la opción principal cuando está
habilitado. Si no está disponible, o si el cliente lo elige, la orden permanece en
`pending_payment` / `pending` y se prepara un mensaje al WhatsApp oficial con el
resumen autoritativo del pedido. Abrir WhatsApp no borra el carrito: sólo lo hace la
acción explícita `YA ENVIÉ EL MENSAJE. FINALIZAR PEDIDO`; esa acción tampoco confirma
ni marca como pagada la orden.
