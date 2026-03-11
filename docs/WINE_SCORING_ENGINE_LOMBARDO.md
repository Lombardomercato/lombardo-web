# WINE_SCORING_ENGINE_LOMBARDO

## Objetivo

Definir cómo priorizar vinos del catálogo Lombardo cuando una consulta requiere recomendación concreta.

## Principios

1. Nunca recomendar etiquetas fuera del catálogo activo.
2. Priorizar coherencia con la intención detectada (producto, caja, mensualidad, etc.).
3. Priorizar contexto del cliente (ocasión, estilo, comida, presupuesto, historial).
4. En empate, priorizar opciones con mejor encaje comercial real (stock y prioridad de venta).

## Señales que deben ponderar

- tipo de vino
- maridaje principal
- ocasión
- varietal
- estilo (suave, intenso, fresco, frutado, etc.)
- presupuesto (distancia al rango pedido)
- perfil inferido (si aplica)
- prioridad comercial interna (solo como desempate)

## Reglas de seguridad

- Si no hay match fuerte, devolver pocas opciones (1 a 3) y explicitar incertidumbre.
- No forzar 3 opciones si el catálogo no tiene buen fit.
- No inventar precio, stock ni características.

## Formato esperado de salida

- Máximo 3 vinos.
- Cada vino con motivo breve de recomendación (1 oración clara).
- Si falta contexto crítico, hacer solo una pregunta de seguimiento.

## Modo caja

Cuando la intención es `consulta_caja`, usar la lógica:

1. opción segura
2. opción más especial
3. opción para descubrir

Siempre con etiquetas reales y disponibles.

## Modo mensualidad/club

Cuando la intención es `consulta_mensualidad` o `consulta_club`:

- explicar lógica de selección mensual
- proponer composición orientativa alineada al perfil
- mantener foco en beneficios y utilidad concreta
