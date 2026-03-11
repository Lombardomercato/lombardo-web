# ARCHITECTURE_LEGACY_NOTES

## Estado canónico aplicado

Fuente de verdad: `docs/LOMBARDO_ARCHITECTURE.md`.

Capas canónicas activas en runtime:
- `pages/`
- `features/`
- `components/`
- `system/`
- `ai/`
- `assets/`

## Legacy mantenido por compatibilidad

- Rutas legacy `/*.html` (por ejemplo `/sommelier.html`, `/wine-tinder.html`, `/club.html`) conviven con rutas canónicas `/pages/*/`.
- `features/sommelier/sommelier-chat.js` quedó como puente al backend canónico `api/sommelier-chat.js` para evitar lógica duplicada.
- Carpeta `assests/` se considera typo legacy frente a `assets/`.

## Decisión de arquitectura

No se mantiene un runtime paralelo para IA: la lógica canónica de intención, recomendación y prompt vive en `api/` y es consumida por chat global, Sommelier IA y Wine Tinder.
