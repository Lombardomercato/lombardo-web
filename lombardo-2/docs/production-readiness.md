# Lombardo 2.0 — configuración de producción

## Política inicial de pagos

El lanzamiento controlado debe usar `PAYMENTS_ENABLED=false`. La orden se persiste
como `pending_payment` / `pending` y selecciona `whatsapp_coordination`. Mercado Pago
TEST permanece disponible únicamente en Preview; no se elimina código ni se aceptan
credenciales TEST en Vercel Production.

Antes de desplegar, ejecutar `pnpm production:check` con las variables del entorno
productivo. El comando sólo informa nombres de variables faltantes; nunca imprime
secretos.

## Matriz de variables

| Variable | Preview/DEV | Production | Exposición | Requisito |
| --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Alias Preview recomendado | URL canónica HTTPS | Pública | Obligatoria |
| `NEXT_PUBLIC_WHATSAPP_URL` | WhatsApp oficial | WhatsApp oficial | Pública | Obligatoria |
| `NEXT_PUBLIC_PICKUP_ADDRESS` | Valor de prueba autorizado | Dirección oficial | Pública | Obligatoria para lanzamiento |
| `NEXT_PUBLIC_PICKUP_HOURS` | Valor de prueba autorizado | Horario oficial | Pública | Obligatoria para lanzamiento |
| `NEXT_PUBLIC_DELIVERY_COST_MODE` | `FREE`, `FLAT_RATE` o `TO_BE_CONFIRMED` | Igual al servidor | Pública | Obligatoria |
| `NEXT_PUBLIC_DELIVERY_FLAT_RATE` | Importe si aplica | Igual al servidor | Pública | Condicional |
| `RUNIA_ENVIRONMENT` | `development` | `production` | Server-only | Obligatoria |
| `RUNIA_SUPABASE_URL` | Runia Dev | Runia Production | Server-only | Obligatoria |
| `RUNIA_SUPABASE_SECRET_KEY` | Secret Key Dev | Secret Key Production independiente | Server-only | Obligatoria |
| `RUNIA_TENANT_SLUG` | Tenant Dev | Tenant Production | Server-only | Obligatoria |
| `DELIVERY_COST_MODE` | Igual al valor público | Igual al valor público | Server-only | Obligatoria |
| `DELIVERY_FLAT_RATE` | Importe si aplica | Igual al valor público | Server-only | Condicional |
| `PAYMENTS_ENABLED` | `true` sólo para Sandbox o `false` | `false` para lanzamiento inicial | Server-only | Obligatoria |
| `APP_URL` | Alias HTTPS estable | Futuro dominio productivo | Server-only | Sólo si pagos habilitados |
| `MERCADO_PAGO_MODE` | `TEST` | No configurar mientras pagos estén deshabilitados | Server-only | Sólo si pagos habilitados |
| `MERCADO_PAGO_ACCESS_TOKEN` | Credencial TEST | No configurar todavía | Server-only | Sólo si pagos habilitados |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Secreto TEST | No configurar todavía | Server-only | Sólo si pagos habilitados |
| `MERCADO_PAGO_WEBHOOK_TOLERANCE_SECONDS` | `300` por defecto | Futuro | Server-only | Opcional |

Ninguna credencial, token o Secret Key puede llevar el prefijo `NEXT_PUBLIC_`.

## Acceso runtime a Runia/Supabase

| Tabla | Uso de Lombardo | Origen | Rol | Data API | Política mínima |
| --- | --- | --- | --- | --- | --- |
| `tenants` | Valida tenant activo en el join de proveedor | Servidor | Secret Key/service role | Sí, lectura | Sin acceso de navegador |
| `suppliers` | Resuelve VINROS activo | Servidor | Secret Key/service role | Sí, lectura | Sin acceso de navegador |
| `supplier_products` | Catálogo SAFE y validación de carrito | Servidor | Secret Key/service role | Sí, lectura | Sin acceso de navegador |
| `supplier_prices` | Precio retail vigente | Servidor | Secret Key/service role | Sí, lectura | Sin acceso de navegador |
| `commerce_orders` | Crear, leer y actualizar órdenes | Servidor | Secret Key/service role | Sí | RLS forzado; sin grants públicos |
| `commerce_payment_events` | Webhooks verificados e idempotencia | Servidor | Secret Key/service role | Sí | RLS forzado; sin grants públicos |
| `products`, `product_prices`, `categories`, `brands`, `product_images` | No usados | Ninguno | Ninguno | No requerido por Lombardo | Revisar consumidores Runia antes de revocar o activar RLS |

El frontend no contiene cliente Supabase ni recibe una publishable/anon key. Cualquier
hardening de tablas core debe coordinarse con los demás consumidores de Runia y probarse
antes de aplicar; no se debe activar RLS a ciegas.
