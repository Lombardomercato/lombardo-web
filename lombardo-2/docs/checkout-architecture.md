# Checkout → Runia → Mercado Pago

El navegador envía únicamente productos, cantidades, datos del comprador, entrega,
`checkout_session_id` e `idempotency_key`. Subtotal, envío y total se recalculan en
el servidor. Cualquier campo económico extra del cliente se ignora.

## Orden

`RuniaOrderRepository` consulta una fuente autoritativa de productos y valida:

1. existencia y estado activo;
2. disponibilidad y cantidad;
3. precio esperado frente al precio vigente;
4. costo de entrega configurado en servidor;
5. subtotal y total recalculados.

`SupabaseOrderStore` inserta una única fila con snapshots JSONB. Las restricciones
`(tenant_id, checkout_session_id)` y `(tenant_id, idempotency_key)` hacen atómica la
idempotencia. Ante una colisión se recupera la orden existente.

El esquema está en `supabase/schema/lombardo_commerce_orders.sql`. Las tablas tienen
RLS forzado, no poseen políticas públicas y revocan acceso a `anon` y `authenticated`.
La secret key de Runia sólo vive en el servidor.

`RuniaCommerceProvider` consulta directamente los `supplier_products` activos y
`safe` de VINROS con su precio `retail`, y conserva el `runia_product_id` en el
snapshot. No existe una fuente local ni un adapter de catálogo intermedio.

## Mercado Pago

La preferencia de Checkout Pro se crea después de persistir la orden. Sus items,
monto, moneda y `external_reference` provienen de esa orden. Los retries reutilizan
una clave estable `lombardo_preference_{order_id}`.

La integración usa `sandbox_init_point` en TEST e `init_point` en LIVE y sólo acepta
URLs HTTPS cuyo hostname pertenece a Mercado Pago. También comprueba que el
`collector_id` de la preferencia coincida con `MERCADO_PAGO_SELLER_ID`. `APP_URL`
debe ser HTTPS, pública y sin path: las URLs de retorno no admiten localhost.

TEST nunca puede usar el dominio oficial. LIVE exige simultáneamente Vercel
Production, Runia Production y `APP_URL=https://www.lombardomercato.com`.

Las return URLs muestran experiencia, pero nunca modifican estados. Sólo el webhook
firmado consulta `/v1/payments/{id}`, compara tenant, orden, metadata, monto, moneda
y el valor exacto de `live_mode`, y aplica la transición.

Política V1:

- `approved` → pago `approved`, orden `confirmed`;
- `rejected` → pago `rejected`, orden `pending_payment` para reintento;
- `pending`/`in_process` → ambos pendientes;
- `cancelled` → pago cancelado, orden pendiente para reintento;
- `refunded`/`charged_back` después de aprobación → pago `refunded`, orden `cancelled`.

El evento, la transición de la orden y `processed_at` se escriben en una única función
Postgres `SECURITY INVOKER`, ejecutable sólo por `service_role`. La restricción única
del evento hace que dos webhooks concurrentes produzcan un solo efecto.

Referencias oficiales verificadas:

- https://www.mercadopago.com.ar/developers/es/reference/online-payments/checkout-pro/preferences/create-preference/post
- https://www.mercadopago.com.ar/developers/en/docs/your-integrations/notifications/webhooks
- https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/configure-back-urls
- https://supabase.com/docs/guides/database/secure-data
