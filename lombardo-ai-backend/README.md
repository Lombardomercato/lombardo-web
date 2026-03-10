# lombardo-ai-backend

Backend externo y simple para el **Asistente IA Lombardo**, listo para deploy en **Vercel**.

## Qué resuelve
Como la web de Lombardo está en hosting estático, este proyecto expone un endpoint real para el chat:

- `POST /api/sommelier-chat`

Recibe `message`, `history` y `pagina_actual`, usa `vinos_lombardo_base.json` como base local, arma contexto y consulta OpenAI con `OPENAI_API_KEY`.

---

## Stack
- Node.js serverless function (Vercel Functions)
- Sin dependencias externas (usa `fetch` nativo de Node)

---

## Estructura

```txt
lombardo-ai-backend/
  api/
    sommelier-chat.js
  vinos_lombardo_base.json
  vercel.json
  package.json
  .env.example
```

---

## Variables de entorno
Configuralas en Vercel (`Project Settings > Environment Variables`):

- `OPENAI_API_KEY` (**obligatoria**)
- `OPENAI_MODEL` (opcional, default: `gpt-4o-mini`)
- `WHATSAPP_URL` (opcional, default ya incluido)

### Dónde configurar `OPENAI_API_KEY`
1. Entrá a tu proyecto en Vercel.
2. `Settings` → `Environment Variables`.
3. Creá `OPENAI_API_KEY` y pegá tu API key.
4. Re-deploy del proyecto.

---

## Deploy en Vercel (paso a paso)

## Opción A: desde GitHub (recomendada)
1. Subí esta carpeta como repo independiente (`lombardo-ai-backend`).
2. En Vercel: **Add New Project**.
3. Importá el repo.
4. Configurá `OPENAI_API_KEY` en Environment Variables.
5. Deploy.

## Opción B: con Vercel CLI
```bash
npm i -g vercel
cd lombardo-ai-backend
vercel
vercel --prod
```
Después configurá variables de entorno:
```bash
vercel env add OPENAI_API_KEY production
vercel env add OPENAI_API_KEY preview
```

---

## Endpoint

### Request
`POST /api/sommelier-chat`

```json
{
  "message": "Quiero un vino para regalar",
  "history": [],
  "pagina_actual": "home"
}
```

### Response OK (200)
```json
{
  "ok": true,
  "answer": "¡Qué buen plan! Para regalo te sugeriría...",
  "suggest_whatsapp": false,
  "whatsapp_label": "Continuar por WhatsApp",
  "whatsapp_url": "https://wa.me/5434...",
  "source": "openai"
}
```

### Response Error (ejemplo)
```json
{
  "ok": false,
  "error": "No se pudo generar la respuesta del asistente en este momento.",
  "error_code": "OPENAI_HTTP_ERROR"
}
```

Siempre devuelve JSON válido.

---

## Integración con el frontend actual

Cuando deployes, Vercel te dará una URL base (ejemplo):

- `https://lombardo-ai-backend.vercel.app`

Entonces el frontend debe usar como `assistantApiUrl`:

- `https://lombardo-ai-backend.vercel.app/api/sommelier-chat`

Si usás el meta tag ya soportado por el frontend:

```html
<meta name="assistant-api-url" content="https://lombardo-ai-backend.vercel.app/api/sommelier-chat" />
```

O con base URL:

```html
<meta name="assistant-api-base" content="https://lombardo-ai-backend.vercel.app" />
```

---

## Comportamiento del asistente
El backend instruye al modelo para responder como **Asistente IA Lombardo**:
- tono cálido, claro y premium
- útil en vinos, regalos, cajas, club, café y experiencias
- si la consulta es de vinos, usa la base local
- no inventa vinos/precios/stock
- si falta información, responde con honestidad y puede sugerir WhatsApp

