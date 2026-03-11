# LOMBARDO_ARCHITECTURE

## Objetivo del documento

Este documento define la arquitectura oficial del proyecto Lombardo.

Sirve como referencia para:

- desarrollo del sitio
- desarrollo de IA
- reorganización de código
- trabajo con Codex
- evitar duplicados o rutas inconsistentes

Este archivo es la **fuente de verdad del proyecto**.

---

# Arquitectura general

El sitio Lombardo se estructura en 5 capas principales.


pages
features
components
system
ai
assets
docs


Cada capa tiene responsabilidades específicas.

---

# Páginas canónicas

Las únicas páginas reales del sitio son:

| Página | Ruta |
|------|------|
Home | /pages/home/
Sommelier IA | /pages/sommelier-ia/
Wine Tinder | /pages/wine-tinder/
Experiencias | /pages/experiencias/
Club | /pages/club/
Tienda | /pages/tienda/
Contacto | /pages/contacto/

No se deben crear nuevas páginas principales sin actualizar este documento.

---

# Navegación principal

Menú oficial del sitio:

HOME  
SOMMELIER IA  
EXPERIENCIAS  
CLUB  
CONTACTO  

CTA principal:

DESCUBRÍ TU VINO → /pages/wine-tinder/

---

# Estructura de carpetas

## /pages

Contiene páginas reales del sitio.


pages/
home/
sommelier-ia/
wine-tinder/
experiencias/
club/
tienda/
contacto/


Cada carpeta contiene:


index.html


---

## /features

Contiene funcionalidades grandes del producto.


features/
assistant/
sommelier/
wine-tinder/
catalog/
club/
experiences/


Las features no deben duplicar UI.

---

## /components

Componentes reutilizables.


components/
layout/
navbar
footer

ui/
button
card
badge

wine/
wine-card

ai/
chat-widget
ai-message


---

## /system

Design system.


system/
colors
typography
spacing
shadows
motion


Este sistema controla:

- tipografías
- colores
- bordes
- espaciados
- animaciones

---

## /ai

Lógica del sistema IA.


ai/
intent-detection
recommendation-engine
wine-profile
catalog-routing
fallback-engine


---

# Catálogo de vinos

Fuente única:


/vinos_lombardo_base.json


Todas las funciones deben usar este endpoint.

Nunca usar rutas relativas desde páginas.

---

# IA Lombardo

El sistema de IA tiene tres módulos principales:

### Chat global
Asistente general disponible en toda la web.

### Sommelier IA
Recomendador guiado.

### Wine Tinder
Perfil de vino mediante swipe o quiz.

Todos deben usar:

- catálogo canónico
- detección de intención
- AI_SYSTEM_PROMPT_LOMBARDO.md

---

# Design System

La web debe seguir estas reglas:

- estilo minimalista
- inspiración Apple
- mucho espacio en blanco
- tipografías del manual de marca
- animaciones suaves
- cards limpias

---

# Assets


assets/
images/
wine/
icons/


Evitar carpetas duplicadas como:

- fotos
- hero
- logos
- assests (typo)

---

# Reglas de desarrollo

1. No duplicar features.
2. No crear rutas nuevas fuera de /pages.
3. No duplicar catálogo.
4. No crear múltiples runtimes para la misma feature.
5. Mantener coherencia con el design system.

---

# Documentación del proyecto

La carpeta `/docs` contiene:

- arquitectura
- tono del asistente
- sistema IA
- guías de diseño

Archivos principales:


AI_SYSTEM_PROMPT_LOMBARDO.md
AI_TONE_GUIDE_LOMBARDO.md
LOMBARDO_ARCHITECTURE.md

---

# Regla final

El sitio Lombardo debe sentirse como un **producto digital coherente**, no como páginas sueltas.

Arquitectura clara = menos bugs, menos duplicados y mejor evolución del proyecto.
