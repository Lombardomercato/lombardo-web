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
- `NEXT_PUBLIC_WHATSAPP_URL`: enlace completo de WhatsApp. Permanece vacío hasta confirmar el número oficial.
- `NEXT_PUBLIC_PICKUP_ADDRESS`: dirección configurable del retiro.
- `NEXT_PUBLIC_PICKUP_HOURS`: horario configurable del retiro.
- `NEXT_PUBLIC_DELIVERY_COST_MODE`: `FREE`, `FLAT_RATE` o `TO_BE_CONFIRMED`.
- `NEXT_PUBLIC_DELIVERY_FLAT_RATE`: costo entero cuando se usa tarifa fija.

Las variables server-only de Runia y Mercado Pago están documentadas en
`.env.example`. No deben llevar el prefijo `NEXT_PUBLIC_`.

## Comercio

El catálogo consume `CommerceProvider`, nunca una fuente concreta. Sin configuración
Runia, el desarrollo visual continúa con datos locales. Con
`RUNIA_ENVIRONMENT=development`, `RuniaCommerceProvider` filtra los mappings SAFE de
Runia Dev y conserva los componentes visuales existentes.

El checkout crea órdenes mediante `/api/orders`. `RuniaOrderRepository` vuelve a
consultar productos, recalcula importes y persiste snapshots inmutables mediante
`SupabaseOrderStore`. La base protege la idempotencia con restricciones únicas por
tenant, sesión y clave.

La creación de órdenes exige Runia Dev y no tiene fallback al catálogo local. Precio,
elegibilidad y disponibilidad salen del adapter temporal documentado en
`docs/runia-dev-setup.md`. Los precios del navegador sólo detectan `PRICE_CHANGED`.

Checkout Pro se habilita únicamente con `PAYMENTS_ENABLED=true`, credenciales TEST y
una `APP_URL` HTTPS pública. La guía completa está en `docs/sandbox-payments.md`.
Antes de una prueba real, `pnpm sandbox:check` debe terminar con
`SANDBOX INFRA READY: YES`.
