# Lombardo Website Structure

## Nueva arquitectura (v2)

### Pages

- `pages/home/index.html`
- `pages/sommelier-ia/index.html`
- `pages/wine-tinder/index.html`
- `pages/experiencias/index.html`
- `pages/club/index.html`
- `pages/tienda/index.html`
- `pages/contacto/index.html`

### Features

- `features/sommelier/`
- `features/wine-tinder/`
- `features/catalog/`
- `features/club/`

### Components

- `components/layout/`
- `components/ui/`
- `components/wine/`
- `components/ai/`

### System (design system)

- `system/design-system.md`
- `system/brand-guidelines.md`
- `system/lombardo-ai-design-system.json`
- `system/colors/`
- `system/typography/`
- `system/spacing/`
- `system/animations/`

### AI

- `ai/intent-detection/`
- `ai/recommendation-engine/`
- `ai/wine-profile/`

## Compatibilidad de rutas actuales

Se mantienen los entrypoints históricos en raíz para no romper links existentes:

- `index.html`
- `sommelier.html`
- `tinder-wine.html`
- `experiencias.html`
- `club.html`
- `tienda.html`
- `contacto.html`

Cada uno redirige a su nueva ubicación dentro de `/pages/*`.

## Política de assets para patch de reorganización

Las carpetas de assets se mantienen en:

- `assets/images/`
- `assets/icons/`
- `assets/wine/`

En este patch de reorganización solo se versionan cambios de código y estructura (sin binarios).

