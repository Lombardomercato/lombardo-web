# Arquitectura canónica Lombardo

## Páginas canónicas
- `/pages/home/`
- `/pages/sommelier-ia/`
- `/pages/wine-tinder/`
- `/pages/experiencias/`
- `/pages/club/`
- `/pages/tienda/`
- `/pages/contacto/`

Las rutas legacy (`/sommelier.html`, `/wine-tinder.html`, etc.) se mantienen sólo como redirects.

## Módulos
- `src/scripts/script.js`: runtime único para navegación, Chat Global, Sommelier IA y Wine Tinder.
- `src/styles/style.css`: sistema visual canónico y tipografía global.
- `vinos_lombardo_base.json`: catálogo único de vinos consumido por IA, Sommelier y Tinder.

## Estructura
- `pages/`: vistas canónicas
- `features/`: lógica por feature
- `components/`: bloques UI
- `system/`: design system y guías
- `ai/`: criterios IA, prompts e intención
- `assets/`: imágenes/video
- `fonts/`: fuentes de marca
