# Runia · avisos de estado por WhatsApp

Canvas: `LOMBARDO · ESTADOS DE PEDIDO`

El canvas es transaccional e independiente del asistente comercial. Lombardo envía sólo datos del pedido resueltos por servidor; Runia resuelve el contacto, envía la plantilla y confirma el resultado al outbox de Lombardo.

## Plantilla Meta

- Nombre: `lombardo_estado_pedido`
- Categoría: `UTILITY`
- Idioma: `es_AR`
- Cuerpo:

```text
Hola {{1}}, tu pedido {{2}} tiene una actualización.

{{3}}
{{4}}

Total: {{5}}
Seguí tu pedido: {{6}}
```

Parámetros: nombre, número de pedido, estado, detalle, total y URL pública del pedido.

## Activación

1. Aprobar la plantilla en Meta y asociar su ID al nodo `Avisar estado del pedido`.
2. Publicar el canvas de Runia y copiar su URL de webhook.
3. Aplicar las migraciones de outbox/RLS y compatibilidad con gestión de pedidos.
4. Configurar en Vercel los cuatro valores `RUNIA_ORDER_STATUS_*` server-only.
5. Habilitar `RUNIA_ORDER_STATUS_NOTIFICATIONS_ENABLED=true` sólo después del smoke test.

No se versionan secretos, tokens ni credenciales de WhatsApp.
