# Reporte para soporte de Mercado Pago — Sandbox Argentina

Fecha de consolidación: 2026-08-12. Alcance: vendedor y comprador TEST, Runia Dev y
Preview `lombardo-sandbox-dev`. No se usaron credenciales LIVE ni dinero real.

## Evidencia del bloqueo

| Dato | Valor observado |
| --- | --- |
| País de ambas cuentas TEST | Argentina |
| Seller TEST ID | `3605075037` |
| Buyer TEST ID | `3605075039` |
| Preference ID del último intento | `3605075037-aff8ecb3-f66c-4a46-afc3-8096f3e2c768` |
| Merchant order IDs observados | `43491271591`, `43522307736`, `43522541064` |
| Creación/lectura de preference vía API | HTTP 200 |
| Error mostrado antes de crear el pago | `payment_creation_failed` |
| Payments creados | `0` |
| Provider payment IDs | Ninguno |
| Webhook público | Accesible, firma validada y endpoint operativo |

El Checkout Pro TEST recibe la preference, pero el flujo falla antes de crear un
recurso `payment`. Por eso no existe un payment ID que pueda consultarse ni un evento
de pago que el webhook deba procesar. Se solicita a soporte revisar el estado y la
habilitación interna de las cuentas TEST y de Checkout Pro Sandbox para Argentina.

No se realizaron más intentos con tarjetas después de aislar este bloqueo.
