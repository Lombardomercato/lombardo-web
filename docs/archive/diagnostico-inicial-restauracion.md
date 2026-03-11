# Diagnóstico inicial corto (previo a reconstrucción)

## 1) Qué rompió la reestructuración
- Se mezclaron rutas canónicas (`/pages/*`) con lógica heredada basada en nombres de archivo legacy (`*.html`) para resolver contexto de IA.
- Resultado: el asistente quedaba con contexto incorrecto en varias páginas canónicas (frecuentemente `home`/`general`).

## 2) Qué archivos de tipografía dejaron de cargar
- `src/styles/style.css` y `src/styles/styles.css` tenían `@font-face` con rutas relativas `../fonts/*`.
- Desde `/src/styles/*` esas rutas resolvían a `/src/fonts/*` (no existe); las fuentes reales están en `/fonts/*`.

## 3) Qué módulos de IA dejaron de funcionar
- Chat global y Sommelier IA no siempre tomaban contexto correcto por página en rutas canónicas.
- Wine Tinder/Sommelier/Chat habían tenido riesgo de falla por carga de catálogo con ruta relativa (ya corregido a endpoint absoluto canónico).

## 4) Qué documentación .md se perdió o dejó de usarse
- No faltaban todos los `.md`, pero estaban dispersos sin un índice operativo único.
- Faltaba una “fuente viva” central con arquitectura, diseño, IA, tono y navegación; por eso se creó y consolidó `docs/`.
