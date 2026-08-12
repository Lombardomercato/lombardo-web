# Primera compra end-to-end en Mercado Pago TEST

Este runbook es exclusivamente para Runia Dev y Mercado Pago TEST. La aplicación
rechaza `VERCEL_ENV=production`, un `RUNIA_ENVIRONMENT` distinto de `development`,
un modo de Mercado Pago distinto de `TEST` y el dominio productivo de Lombardo como
`APP_URL`.

## Checklist bloqueante previo

- [ ] Proyecto Supabase exclusivo de Runia Dev, activo y con acceso administrativo.
- [ ] `supabase/schema/lombardo_commerce_orders.sql` aplicado.
- [ ] `supabase/verification/verify_lombardo_dev_commerce.sql` ejecutado sin excepciones.
- [ ] VINROS sincronizado en `supplier_products`, con productos `safe` activos y su
      precio `retail` vigente.
- [ ] Proyecto Vercel de Preview con Root Directory `lombardo-2`.
- [ ] Alias HTTPS estable de Preview reservado para `APP_URL`.
- [ ] Aplicación Checkout Pro TEST y Access Token TEST.
- [ ] Comprador TEST del mismo país que el vendedor TEST.
- [ ] Webhook `payment` apuntando al Preview y secret de firma copiado.
- [ ] Todas las variables siguientes limitadas a Preview/Development, nunca Production.

```dotenv
RUNIA_ENVIRONMENT=development
RUNIA_SUPABASE_URL=
RUNIA_SUPABASE_SECRET_KEY=
RUNIA_TENANT_SLUG=lombardo-dev

DELIVERY_COST_MODE=FREE
DELIVERY_FLAT_RATE=0

APP_URL=https://ALIAS-PREVIEW.vercel.app
PAYMENTS_ENABLED=true
MERCADO_PAGO_MODE=TEST
MERCADO_PAGO_ACCESS_TOKEN=
MERCADO_PAGO_WEBHOOK_SECRET=
MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS=300
```

`RUNIA_SUPABASE_SECRET_KEY` admite una Secret Key moderna `sb_secret_...` o una key
legacy cuyo rol JWT sea `service_role`. Una publishable/anon key se rechaza. Ninguna
de estas variables lleva `NEXT_PUBLIC_`.

Checkout Pro redirect no usa Public Key en esta implementación: el servidor crea la
preferencia y el navegador abre el `sandbox_init_point` devuelto. El adapter TEST no
acepta `init_point` como fallback y el webhook rechaza cualquier pago `live_mode=true`.

## Runia Dev y catálogo

Seguir `docs/runia-dev-setup.md`. El catálogo consulta directamente la capa supplier
de VINROS y nunca publica `blocked`, `pending_review` o `supplier_only_cost`.

Validación automática, después de cargar `.env.local`:

```bash
pnpm sandbox:check
```

El comando no imprime secrets. Comprueba configuración, acceso a `commerce_orders`,
catálogo elegible y variables Mercado Pago. Debe terminar en `SANDBOX INFRA READY: YES`.

## Preview HTTPS en Vercel

Existe un proyecto Vercel `lombardo-web` conectado al sitio vigente. No cambiar su
dominio ni su Root Directory para esta prueba. Usar un proyecto separado de Preview
o una configuración de branch aislada cuyo Root Directory sea `lombardo-2`.

1. Vincular desde la carpeta `lombardo-2`.
2. Cargar las variables anteriores sólo en Preview/Development.
3. Ejecutar `pnpm lint`, `pnpm typecheck`, `pnpm test` y `pnpm build`.
4. Crear Preview con `vercel deploy` o mediante una branch no productiva.
5. No usar `--prod`, `promote` ni el dominio `lombardomercato.com`.
6. Fijar `APP_URL` al alias HTTPS estable del branch y volver a desplegar Preview.
7. Configurar en Mercado Pago el webhook:
   `https://ALIAS-PREVIEW.vercel.app/api/payments/mercadopago/webhook`.

## Compra aprobada

1. Abrir el Preview en una ventana de incógnito.
2. Iniciar sesión en Mercado Pago con el usuario comprador TEST, nunca con una cuenta real.
3. Elegir uno de los productos Runia Dev visibles y completar carrito/checkout.
4. Confirmar en Runia Dev una orden `pending_payment` / `pending` y su snapshot.
5. Abrir `CONTINUAR AL PAGO`; debe dirigir al Checkout Pro de prueba.
6. Usar una tarjeta de prueba vigente de la documentación oficial, titular `APRO` y
   DNI `12345678`. No usar tarjetas ni dinero reales.
7. Confirmar un registro en `commerce_payment_events` con `processed_at`.
8. Confirmar `payment_status=approved` y `order_status=confirmed`.
9. Abrir `/pedido/[publicId]`: debe mostrar pago confirmado.
10. Verificar que el carrito se limpia sólo después de leer el estado aprobado desde Runia.

## Fallback temporal por coordinación

Si Checkout Pro TEST no puede crear el pago, el pedido persistido ofrece
`COORDINAR PAGO POR WHATSAPP`. La selección guarda el adaptador genérico
`whatsapp_coordination`, conserva `order_status=pending_payment` y
`payment_status=pending`, y arma el mensaje desde el snapshot autoritativo. No simula
un pago ni modifica el adapter de Mercado Pago.

Abrir o enviar el mensaje no limpia el carrito. La política temporal exige volver al
checkout y pulsar explícitamente `YA ENVIÉ EL MENSAJE. FINALIZAR PEDIDO`; sólo esa
acción local limpia el carrito y abre `/pedido/[publicId]`. La orden continúa pendiente
hasta que exista un mecanismo real y verificable de confirmación del pago.

La evidencia para escalar el bloqueo externo está en
`docs/mercado-pago-support-report.md`.

Mercado Pago recomienda la compra en incógnito y un comprador TEST separado. Consultar
siempre sus [tarjetas y escenarios vigentes](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integration-test/test-purchases)
y la [cuenta comprador TEST](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro/integration-test).

## Matriz de fallos

| Caso | Ejecución | Resultado esperado |
| --- | --- | --- |
| Rechazado | Titular TEST `OTHE`, DNI `12345678` | pago `rejected`; orden `pending_payment`; carrito conservado |
| Pendiente | Titular TEST `CONT` o medio offline disponible | pago y orden pendientes; carrito conservado |
| Volver sin pagar | Abandonar Checkout Pro y volver | la return URL no cambia estados |
| Success antes del webhook | Abrir `?return=success` con DB pendiente | UI muestra `PAGO PENDIENTE` |
| Webhook duplicado | Reenviar el mismo evento | una sola fila/evento efectivo y una transición atómica |
| Refresh pedido | Recargar `/pedido/[publicId]` | estado leído nuevamente desde Runia |
| Preference retry | Forzar fallo temporal y repetir misma sesión/key | misma order; misma idempotency key de preferencia |

## Logging DEV

Los logs JSON usan `scope=lombardo-commerce-dev` y sólo contienen identificadores:

- `order.created` / `order.reused`;
- `payment.preference_created` / `reused` / `failed`;
- `payment.whatsapp_coordination_selected` cuando el gateway está deshabilitado;
- `webhook.received` / `webhook.duplicate`;
- `payment.transition` con estados anterior y nuevo.

No registran nombre, email, WhatsApp, dirección, Access Token, secret de webhook ni
Secret Key de Supabase.
