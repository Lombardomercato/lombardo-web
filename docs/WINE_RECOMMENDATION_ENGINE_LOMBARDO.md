# WINE_RECOMMENDATION_ENGINE_LOMBARDO

## Alcance actual (asesor integral)

El motor de recomendación de Lombardo ya no trabaja solo con vino.
Ahora evalúa catálogo mixto con estas categorías:

- vino
- espumante
- blanco
- rosado
- café
- pastelería
- gourmet / delicatessen
- cajas
- club / mensualidades
- experiencias / catas / eventos

## Reglas principales

1. Priorizar disponibilidad y stock.
2. Detectar presupuesto, ocasión y estilo cuando aparezcan.
3. Detectar intención de combinación (combo/mix/regalo/picada/completo).
4. Devolver máximo 3 recomendaciones principales.
5. Si aplica, sumar propuesta combinada con lógica comercial natural.

## Campos de catálogo esperados

- id
- nombre
- categoria
- subcategoria
- precio
- stock
- disponible
- descripcion_corta
- recomendado_para
- combina_con
- tags
- nivel
- destacado

## Motor de combinaciones

El campo `combina_con` funciona como puente entre productos.

Ejemplos:
- Malbec → quesos semiduros, charcutería, caja regalo clásica.
- Espumante → chocolates, brunch, regalo.
- Café → budín, cookie, gift coffee box.

El motor puede construir propuestas como:
- vino + gourmet
- vino + café + dulce
- espumante + regalo
- caja mixta
