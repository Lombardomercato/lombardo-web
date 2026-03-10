# Auditoría de restauración integral — 2026-03-10

## Qué estaba roto
1. **Tipografías de marca no cargaban**: `@font-face` apuntaba a `../fonts/*` desde `src/styles/*`, ruta inexistente en runtime (`/src/fonts`), forzando fallback del navegador.
2. **Módulos IA sin catálogo real en rutas canónicas**: múltiples `fetch('vinos_lombardo_base.json')` (ruta relativa) fallaban en `/pages/*`, porque resolvían a `/pages/.../vinos_lombardo_base.json`.
3. **Duplicación de lógica viva en Wine Tinder**: coexistían dos runtimes (`script.js` y `tinder-wine.js`), con riesgo de doble inicialización y desalineación funcional.
4. **Documentación dispersa**: lineamientos de arquitectura, diseño, IA, navegación y tono estaban repartidos sin un índice canónico central.

## Qué se restauró
- Tipografía global con rutas absolutas (`/fonts/*`) + `font-display: swap`.
- Endpoint único de catálogo (`WINE_CATALOG_ENDPOINT = '/vinos_lombardo_base.json'`) para Sommelier, Chat y Wine Tinder dentro de `script.js`.
- Runtime canónico único para Wine Tinder (eliminado include de `tinder-wine.js` en la página canónica).
- Carpeta `docs/` como fuente viva central con reglas funcionales y de producto.

## Estado final
- Páginas canónicas siguen bajo `/pages/*`.
- Rutas legacy permanecen como redirect.
- Catálogo de vinos queda como fuente única para recomendaciones.
- Documentación centralizada y trazable.


## Cierre de riesgo residual
- `src/scripts/tinder-wine.js` (runtime legado) fue retirado del repositorio para eliminar regresiones por reutilización accidental.
- La implementación de Wine Tinder queda canónicamente en `src/scripts/script.js`.
