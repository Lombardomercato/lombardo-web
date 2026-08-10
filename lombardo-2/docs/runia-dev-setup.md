# Runia Dev: esquema y catálogo temporal Lombardo

## Aplicación del esquema

Usar únicamente el proyecto Supabase de Runia Dev identificado explícitamente.
Aplicar en este orden:

1. `supabase/schema/lombardo_commerce_orders.sql`;
2. `supabase/schema/lombardo_dev_catalog_adapter.sql`;
3. ejecutar `supabase/verification/verify_lombardo_dev_commerce.sql`;
4. ejecutar advisors de seguridad y rendimiento y resolver cualquier aviso nuevo.

La verificación confirma tablas, constraints de idempotencia, UUID público, RLS
forzado, índices, acceso exclusivo del `service_role` y la función transaccional del
webhook. Supabase puede no exponer nuevas tablas al Data API automáticamente; los
schemas incluyen grants explícitos y mínimos para `service_role`.

## Qué representa el adapter

`commerce_lombardo_dev_product_adapter` es una tabla temporal y explícita de DEV.
No convierte silenciosamente `supplier_product` en el modelo público definitivo.
Cada fila enlaza:

- un producto real/revisado de Runia (`runia_product_id`, `runia_sku`);
- uno de los IDs visuales existentes de Lombardo (`public_product_id`);
- su estado de elegibilidad;
- un precio de venta Lombardo definido manualmente para Sandbox;
- disponibilidad y cantidad ficticias controladas para la prueba.

IDs visuales actualmente disponibles para mapear —elegir entre 1 y 5—:

- `mock-casa-nueve-malbec`;
- `mock-caja-regalo-mixta`;
- `mock-caja-noche`;
- `mock-blanco-criollo`;
- `mock-aceite-oliva`.

## Alta segura de un mapping

Sustituir todos los valores marcados antes de ejecutar. El precio debe ser una decisión
manual para Sandbox; no calcularlo desde costo, mayorista o `business_price`.

```sql
insert into public.commerce_lombardo_dev_product_adapter (
  tenant_slug,
  public_product_id,
  runia_product_id,
  runia_sku,
  display_name,
  eligibility_status,
  lombardo_sale_price,
  currency,
  available_now,
  sandbox_quantity,
  enabled_for_sandbox
) values (
  'lombardo-dev',
  'REEMPLAZAR_CON_ID_VISUAL_PERMITIDO',
  'REEMPLAZAR_CON_ID_REAL_RUNIA_DEV',
  'REEMPLAZAR_CON_SKU_REAL_RUNIA',
  'REEMPLAZAR_CON_NOMBRE_REVISADO',
  'safe',
  REEMPLAZAR_CON_PRECIO_LOMBARDO_DEV,
  'ARS',
  true,
  REEMPLAZAR_CON_CANTIDAD_DEV_ENTRE_1_Y_100,
  true
);
```

La constraint impide activar filas `blocked`, `pending_review` o
`supplier_only_cost`; también impide habilitar filas sin precio, disponibilidad o
cantidad DEV. El provider vuelve a filtrar y validar estas condiciones server-side.

Para retirar inmediatamente un producto de la prueba:

```sql
update public.commerce_lombardo_dev_product_adapter
set enabled_for_sandbox = false
where tenant_slug = 'lombardo-dev'
  and runia_product_id = 'REEMPLAZAR_CON_ID_REAL_RUNIA_DEV';
```

No cargar datos personales, tokens ni secretos en esta tabla.
