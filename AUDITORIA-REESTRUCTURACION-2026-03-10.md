# Auditoría técnica rápida — Reestructuración Lombardo

## Qué está bien
- La arquitectura nueva existe en `/pages/*/index.html` para los módulos objetivo: `home`, `sommelier-ia`, `wine-tinder`, `experiencias`, `club`, `tienda`, `contacto`.
- Las rutas legacy principales (`/index.html`, `/sommelier.html`, `/tinder-wine.html`, `/experiencias.html`, `/club.html`, `/tienda.html`, `/contacto.html`) redireccionan a la arquitectura nueva en `/pages/...`.
- Los features críticos siguen cableados en frontend:
  - **Sommelier IA**: `pages/sommelier-ia/index.html` carga `js/script.js` y contiene `#sommelier-app`.
  - **Wine Tinder**: `pages/wine-tinder/index.html` carga `js/tinder-wine.js`.
  - **Chat global**: `js/script.js` usa endpoint `/api/sommelier-chat`.
  - **Club / cajas / mensualidad**: continúan contemplados por intención y textos en `api/sommelier-chat.js`.
  - **Tienda / catálogo**: existe `pages/tienda/index.html` y referencias de catálogo en backend.

## Qué quedó roto o con riesgo alto
- Hay una **página vieja activa duplicada**: `wine-tinder.html` (completa) convive con `pages/wine-tinder/index.html` y con `tinder-wine.html` (redirect). Riesgo de desalineación funcional/SEO.
- La navegación de las páginas nuevas todavía apunta a URLs legacy (`/sommelier.html`, `/experiencias.html`, `/club.html`, etc.) en lugar de apuntar directo a `/pages/...`.
- En Home (`pages/home/index.html`) varios CTAs siguen yendo a rutas fuera del set principal acordado (`/carta.html`, `/nosotros.html`, `/eventos.html`, `/galeria.html`, `/cafe.html`). No están “rotas” porque existen, pero sí contradicen la arquitectura simplificada objetivo.
- Se detectó al menos una referencia rota en contenido legado: `archive/empresas.html` apunta a `eventos.html` relativo dentro de `archive/`, archivo inexistente en esa ruta.

## Duplicados detectados
- Páginas/entrada duplicadas de Wine Tinder:
  - `wine-tinder.html` (legacy activa)
  - `tinder-wine.html` (redirect)
  - `pages/wine-tinder/index.html` (nueva)
- Código duplicado:
  - `js/tinder-wine.js` y `features/wine-tinder/tinder-wine.js`
  - `api/sommelier-chat.js` y `features/sommelier/sommelier-chat.js`
- Datos duplicados:
  - `lombardo_stock_ai.json` y `ai/recommendation-engine/lombardo_stock_ai.json`
  - `lombardo_stock_ai.template.json` y `ai/recommendation-engine/lombardo_stock_ai.template.json`
  - `vinos_lombardo_base.json` repetido en raíz, `ai/wine-profile/` y `lombardo-ai-backend/`

## Assets: estado
- Existen carpetas pedidas `/assets/images`, `/assets/icons`, `/assets/wine`, pero están prácticamente vacías (`.gitkeep`).
- Los assets reales usados hoy están en `/assets/fotos`, `/assets/hero`, `/assets/logo`, etc.
- Hay carpeta con typo: `/assests/hero/portada2.png` (potencial huérfano).

## Qué corregir antes de seguir
1. Definir una única URL canónica por módulo y unificar menú/CTAs para apuntar directo a `/pages/...`.
2. Resolver Wine Tinder: dejar **solo** una entrada canónica (recomendado `tinder-wine.html` como redirect + `pages/wine-tinder/index.html`) y retirar `wine-tinder.html` legacy activa.
3. Consolidar assets al esquema objetivo (`images/icons/wine`) o actualizar convención oficial para evitar mezcla con `fotos/hero/logo`.
4. Eliminar/archivar duplicados de JS/API/JSON para reducir riesgo de drift.
5. Arreglar o remover referencias legacy rotas dentro de `archive/`.
