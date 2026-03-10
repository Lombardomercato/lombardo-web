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

Las rutas ya están configuradas en css/styles.css.

4) CARTA (PDF)
assets/pdf/menu-lombardo.pdf (ya incluido).
Si lo cambiás, mantené el mismo nombre o actualizá carta.html.

5) WHATSAPP
El número y mensajes están en js/script.js.
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
- El front-end de `sommelier.html` llama a ese endpoint y NO expone la API key en cliente.
- El endpoint usa `vinos_lombardo_base.json` como única base para recomendar.
- Si deployás en hosting estático puro (ej: GitHub Pages), la ruta `/api/sommelier-chat` no existe por defecto.
  - Configurá un backend externo agregando en el `<head>`:
    - `<meta name="assistant-api-url" content="https://tu-backend.com/api/sommelier-chat" />`
    - o `<meta name="assistant-api-base" content="https://tu-backend.com" />`
- Para debug del chat, revisar logs en consola del navegador con prefijo `[assistant-widget][debug]` y en servidor con `[sommelier-chat][debug]`.

