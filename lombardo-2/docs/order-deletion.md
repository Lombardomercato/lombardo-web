# Eliminación recuperable de pedidos

Migración aplicada en Runia Production el 15/09/2026, versión `20260915134906`.
El nombre del archivo coincide con el historial oficial generado por Supabase MCP.
Verificación previa: 275 tests y compilación de la versión oficial actual.
Runia Dev está inactivo y no hay ramas de staging disponibles: no se creó
infraestructura paralela ni se afirmó una validación en staging.

En Admin → Pedidos, el detalle incorpora **Eliminar pedido** para administradores.
Exige motivo, confirmación y la versión vigente del pedido. La papelera permite
restaurar el mismo registro, manteniendo snapshots comerciales y estados.

## Límites

- Sólo pedidos nuevos o cancelados con pago pendiente, rechazado o cancelado.
- No permite eliminar pedidos pagados, en preparación, entregados ni con Mercado Pago.
- Bloquea comprobantes pendientes de revisión y avisos en envío/resultado incierto.
- No elimina físicamente, modifica stock, revierte pagos ni envía notificaciones.
- Oculta pedidos eliminados de operación, cuenta del cliente y seguimiento público.
- Registra actor, motivo y snapshots en la auditoría existente.
- Nunca reutiliza el checkout/idempotency key de un pedido eliminado para crear otro.

## Activación

1. Verificar staging oficial y respaldos; aplicar allí
   `supabase/migrations/20260915134906_recoverable_order_deletion.sql`.
2. Publicar código en staging después de la migración: las lecturas requieren
   las columnas nuevas. No desplegar frontend primero.
3. Probar un pedido ficticio elegible: eliminar, verificar papelera y seguimiento
   oculto, restaurar; comprobar auditoría, permisos y ausencia de avisos/stock/pagos.
4. Tras aprobar staging, aplicar la misma migración y publicar en Production.

Para revertir una eliminación, usar **Restaurar pedido** desde la papelera. No
borrar registros ni columnas con datos auditados para revertir el despliegue.

## Verificación local

`pnpm test`, `pnpm typecheck`, ESLint de archivos modificados y `pnpm build`.
Los tests de SQL utilizan Postgres en memoria (PGlite), sin acceso a datos reales.
