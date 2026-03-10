# Backend canónico del Asistente IA Lombardo

## Implementación oficial (canónica)
- **Endpoint oficial:** `POST /api/sommelier-chat`
- **Endpoint de resumen comercial (lectura):** `GET /api/sommelier-learning-summary`
- **Archivo fuente:** `api/sommelier-chat.js`
- **Motivo de elección:** es la implementación actualmente integrada al frontend principal (`js/script.js`), soporta fallback local cuando no hay `OPENAI_API_KEY`, mantiene contexto por página y contempla lógica comercial/WhatsApp sin romper el chat embebido ni el widget global.

## Contrato canónico

### Request
```json
{
  "message": "string (obligatorio)",
  "history": [{ "role": "user|assistant", "content": "string" }],
  "pagina_actual": "string"
}
```

### Response
```json
{
  "reply": "string",
  "suggestions": ["string"],
  "whatsappUrl": "string",
  "fallback": {
    "used": true,
    "mode": "openai|local"
  },
  "learning": {
    "categoria_consulta": "string",
    "perfil_detectado": "string",
    "tipo_cierre": "string"
  }
}
```

Notas:
- `suggestions` aplica cuando haya sugerencias contextuales (por ejemplo, continuidad comercial).
- `whatsappUrl` aplica cuando corresponde derivación comercial.
- `fallback.used` indica si respondió con fallback local por falta de OpenAI.

## Compatibilidad transitoria
La implementación canónica mantiene campos legacy en paralelo (`answer`, `suggest_whatsapp`, `whatsapp_label`, `whatsapp_url`) para no romper consumidores existentes durante la migración.

## Implementación deprecada (fuera de uso)
- `lombardo-ai-backend/api/sommelier-chat.js`
- Queda marcada como **deprecated** para evitar drift arquitectónico.
- Razón: usa contrato y comportamiento distintos (Chat Completions + shape diferente), lo que había generado desalineación con producción.


## Capa de aprendizaje comercial (sin autoentrenamiento)
- Cada interacción del chat se registra de forma estructurada en JSONL (`data/ai-interactions.jsonl` por defecto).
- Archivo configurable por variable `AI_INTERACTIONS_FILE` para poder apuntar a storage/DB externo sin romper el endpoint.
- Campos guardados por interacción:
  - `fecha`
  - `mensaje_usuario`
  - `pagina_actual`
  - `intencion_detectada`
  - `perfil_detectado`
  - `categoria_consulta`
  - `productos_sugeridos`
  - `tipo_cierre`
  - `derivo_whatsapp`
- Clasificación de categorías habilitadas:
  `maridaje`, `recomendacion_producto`, `regalo`, `caja`, `mensualidad`, `club`, `varietales`, `temperatura_servicio`, `experiencias`, `cafe`, `evento`, `contacto`.
- El resumen periódico se obtiene con `GET /api/sommelier-learning-summary` y entrega `Resumen IA Lombardo` con:
  - top preguntas
  - top perfiles
  - top categorías
  - vinos más sugeridos
  - oportunidades detectadas
  - temas flojos del asistente

Esta capa se usa para optimización comercial y de producto; **no** activa autoentrenamiento automático del modelo.
