# Backend canónico del Asistente IA Lombardo

## Implementación oficial (canónica)
- **Endpoint oficial:** `POST /api/sommelier-chat`
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
