# Reporte para soporte de Mercado Pago — Checkout Pro TEST Argentina

Fecha de actualización: 2026-08-14. Alcance exclusivo: cuentas, credenciales y
tarjetas TEST de Mercado Pago en Argentina. No se usaron credenciales LIVE, dinero
real ni manipulación manual de estados.

## Resumen del incidente

Checkout Pro TEST recibe una preference válida y crea el `merchant_order`, pero
falla antes de crear el recurso `payment`. La interfaz muestra “No pudimos procesar
tu pago”. El comportamiento coincide con el error observado anteriormente:
`payment_creation_failed`.

Como no se crea un payment, no existe provider payment ID, no se emite un webhook
de pago y la orden permanece correctamente en `pending_payment` / `pending`.

## Último intento reproducible

| Dato | Valor observado |
| --- | --- |
| Orden (`external_reference`) | `837a9686-e561-44c1-b6a2-81477634f8d1` |
| Preference ID | `3605075037-b0374e31-93b6-42d2-85c5-ea510a6d3680` |
| Merchant order ID | `43606049465` |
| Seller TEST ID | `3605075037` |
| Buyer TEST ID | `3605075039` |
| País de ambas cuentas TEST | Argentina |
| Producto | DOMINIO RUTINI V Malbec x 750cc |
| SKU | `RUT150B` |
| Total | ARS 26.701 |
| Creación de preference vía API | HTTP 200 |
| Checkout utilizado | `sandbox_init_point` de la preference |
| Mensaje mostrado | “No pudimos procesar tu pago” |
| Payments creados | `0` |
| Provider payment ID | `null` |
| Payment events persistidos | `0` |
| Estado de la orden | `pending_payment` |
| Estado del pago | `pending` |

Timestamps disponibles del último intento:

- Orden creada: `2026-08-14 14:48:54.746273+00`.
- Merchant order creado (timestamp devuelto por Mercado Pago):
  `2026-08-14T10:59:32.956-04:00`.

## Intentos anteriores con el mismo comportamiento

- Merchant orders: `43491271591`, `43522307736`, `43522541064`.
- Preference: `3605075037-aff8ecb3-f66c-4a46-afc3-8096f3e2c768`.

## Validaciones ya realizadas

- Vendedor TEST y comprador TEST correctos, distintos y ambos de Argentina.
- Credenciales TEST automáticas actuales correspondientes a la misma aplicación.
- Preference válida, con `external_reference`, monto y moneda correctos.
- `sandbox_init_point`, `back_urls` y webhook público configurados correctamente.
- El `merchant_order` se crea, pero quedan `0` payments asociados.
- Se probó con el comprador TEST correcto autenticado y tarjetas TEST oficiales.
- La implementación fue auditada; TypeScript, ESLint, tests y build pasan.
- Los `0` webhooks son consistentes con la ausencia del recurso `payment`.
- No se usaron credenciales LIVE, dinero real ni pagos reales.
- No se alteraron manualmente estados de orden o pago.

Después de confirmar el patrón se detuvieron los intentos TEST con tarjetas.

## Solicitud de diagnóstico interno

Solicitamos a Mercado Pago revisar internamente:

1. Por qué Checkout Pro TEST crea correctamente la preference y el
   `merchant_order`, pero falla antes de crear el recurso `payment`.
2. Qué error interno está asociado al merchant order `43606049465` y a los IDs
   históricos indicados.
3. Por qué la interfaz sólo presenta “No pudimos procesar tu pago”, sin un código
   de error accionable para la integración.
4. Si las cuentas TEST seller `3605075037` y buyer `3605075039` tienen alguna
   restricción o estado interno incompatible con Checkout Pro TEST.
5. Si existe un problema con las credenciales TEST automáticas actuales de esta
   aplicación.
6. Si existe una limitación o incidente vigente de Checkout Pro TEST en Argentina.
7. Qué corrección o regeneración de recursos TEST recomiendan antes de repetir la
   prueba.

## Mensaje técnico corto para el canal de soporte

> Checkout Pro TEST Argentina falla de forma reproducible antes de crear el recurso
> `payment`. Último caso: preference
> `3605075037-b0374e31-93b6-42d2-85c5-ea510a6d3680` (API HTTP 200), merchant order
> `43606049465`, external reference
> `837a9686-e561-44c1-b6a2-81477634f8d1`, seller TEST `3605075037` y buyer TEST
> `3605075039`. El checkout muestra “No pudimos procesar tu pago”; payments creados:
> 0, provider payment ID: null y webhooks de pago: 0. El mismo patrón ocurrió con
> merchant orders `43491271591`, `43522307736` y `43522541064`. Solicitamos revisar
> los logs internos, restricciones de las cuentas/credenciales TEST y cualquier
> incidente de Checkout Pro TEST Argentina. No se usaron credenciales LIVE ni
> dinero real.

Este reporte no contiene access tokens, cookies, secretos, números de tarjeta ni
información personal sensible.
