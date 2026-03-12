LOMBARDO — WEB (APPLE MINIMAL)

1) QUÉ ES
Sitio estático (HTML + CSS + JS). Ideal para GitHub Pages.

2) CÓMO USAR
- Abrí index.html para verlo local (doble click).
- Subí TODO el contenido del ZIP a tu repo (en la raíz).

3) TIPOGRAFÍAS (IMPORTANTE)
Por derechos/licencias, este ZIP deja la carpeta /fonts lista, pero vos tenés que copiar ahí:
- GopherDisplay-Regular.woff2
- GopherDisplay-Bold.woff2
- articulat-regular.otf
- articulat-bold.otf

Las rutas ya están configuradas en `src/styles/styles.css`.

4) CARTA (PDF)
assets/pdf/menu-lombardo.pdf (ya incluido).
Si lo cambiás, mantené el mismo nombre o actualizá carta.html.

5) WHATSAPP
El número y mensajes están en `src/scripts/script.js`.
Buscá:
const phone = "5493412762319";

6) MAPA
El iframe está en contacto.html (ya integrado con tu link).

7) COLORES
El CSS usa SOLO la paleta del manual:
#003A70 (azul), #FFB3AB (rosa), #E4D5D3 (beige/gris), #E03C31 (rojo), #D4EB8E (verde casi sin uso).
No hay colores externos (solo opacidades).

8) SUBIR A GITHUB PAGES
- Repo > Settings > Pages
- Source: Deploy from a branch
- Branch: main / (root)
- Esperá el deploy.

9) DOMINIO
Si usás lombardomercato.com:
- Archivo CNAME con: www.lombardomercato.com
- DNS:
  - A @ -> 185.199.108.153
  - A @ -> 185.199.109.153
  - A @ -> 185.199.110.153
  - A @ -> 185.199.111.153
  - CNAME www -> lombardomercato.github.io

Listo.


10) ESTRUCTURA DE PÁGINAS
Páginas núcleo actuales:
- index.html
- nosotros.html
- carta.html
- cafe.html
- vinos.html
- experiencias.html
- eventos.html
- club.html
- galeria.html
- contacto.html
- tienda.html

Legado archivado:
- archive/empresas.html


11) SOMMELIER IA (CHAT EN BACKEND)
- Nuevo endpoint backend sugerido: `POST /api/sommelier-chat` (archivo `api/sommelier-chat.js`).
- Variables de entorno necesarias:
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL` (opcional, default `gpt-4o-mini`)
  - `AI_INTERACTIONS_FILE` (opcional, default `data/ai-interactions.jsonl`)
- El front-end de `sommelier.html` llama a ese endpoint y NO expone la API key en cliente.
- El endpoint usa una base local JSON para recomendar (prioriza stock real cuando está disponible).
- El endpoint ahora prioriza `lombardo_stock_ai.json` (si existe) para recomendaciones con stock real y evita sugerir productos sin stock.
- Si `lombardo_stock_ai.json` no existe, mantiene fallback compatible a `vinos_lombardo_base.json`.
- Plantilla de referencia: `lombardo_stock_ai.template.json`.
- Script de transformación desde export Fudo: `node scripts/transform-fudo-export.js <input.(csv|json)> [output.json]` (output por defecto: `lombardo_stock_ai.json`).
- Además registra interacciones comerciales estructuradas para aprendizaje de negocio (sin autoentrenamiento) y expone resumen en `GET /api/sommelier-learning-summary`.
- Si deployás en hosting estático puro (ej: GitHub Pages), la ruta `/api/sommelier-chat` no existe por defecto.
  - Configurá un backend externo agregando en el `<head>`:
    - `<meta name="assistant-api-url" content="https://tu-backend.com/api/sommelier-chat" />`
    - o `<meta name="assistant-api-base" content="https://tu-backend.com" />`
  - También podés inyectarlo sin redeploy con:
    - Query string: `?assistant_api_url=https://tu-backend.com/api/sommelier-chat`
    - Query string: `?assistant_api_base=https://tu-backend.com`
    - LocalStorage: `assistant-api-url` o `assistant-api-base`
  - El frontend ahora reintenta automáticamente sobre múltiples candidatos hasta encontrar un endpoint disponible.
- Para debug del chat, revisar logs en consola del navegador con prefijo `[assistant-widget][debug]` y en servidor con `[sommelier-chat][debug]`.



12) CANONICAL BACKEND IA (ANTI-DRIFT)
- Backend oficial único: `api/sommelier-chat.js` (`POST /api/sommelier-chat`).
- Contrato canónico documentado en `ai-backend-canonical.md`.
- `lombardo-ai-backend/` queda explícitamente deprecado para evitar drift arquitectónico.
- El frontend (widget global + chat embebido Sommelier) quedó alineado al mismo endpoint y acepta el shape canónico (`reply`, `suggestions`, `whatsappUrl`, `fallback`) con compatibilidad legacy.


13) PANEL ADMIN INSIGHTS
- Nueva vista de analytics: `admin/insights/` (ruta pública esperada: `/admin/insights`).
- API de insights: `GET /api/admin-insights`.
- Autenticación simple opcional por token bearer:
  - Variable de entorno: `ADMIN_INSIGHTS_KEY`
  - Si no está definida, el endpoint permite acceso sin token.
- El endpoint de chat `POST /api/sommelier-chat` ahora registra interacciones en `.data/assistant-interactions.json` para alimentar el dashboard.


14) REORGANIZACIÓN DEL FRONTEND (CÓDIGO)
- CSS movido de `css/` a `src/styles/`.
- JS movido de `js/` a `src/scripts/`.
- Se actualizaron referencias en HTML para usar las nuevas rutas.
- Los assets binarios quedan fuera de este patch de reorganización.

## Operación en Vercel

- Ver checklist de diagnóstico del chat IA: `docs/VERCEL_CHECKLIST_SOMMELIER_CHAT.md`.
