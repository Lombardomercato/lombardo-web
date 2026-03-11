# WINE_RECOMMENDATION_ENGINE_LOMBARDO

## Objetivo

Este documento define cómo el Asistente IA Lombardo debe recomendar vinos.

El objetivo es que las recomendaciones funcionen como lo haría un buen sommelier:

- entender al cliente
- entender la ocasión
- entender el presupuesto
- proponer opciones coherentes

No se trata de listar vinos, sino de recomendar con criterio.

---

# Principio del motor de recomendación

Antes de recomendar un vino, el sistema debe considerar cuatro variables principales:

1. perfil del cliente
2. ocasión
3. presupuesto
4. estilo de vino

Las recomendaciones deben surgir de la combinación de esas variables.

---

# Variables del sistema

## Perfil del cliente

El perfil puede surgir de:

- Wine Tinder
- Sommelier Quiz
- historial de conversación
- preguntas directas

Perfiles principales:

- clásico
- explorador
- elegante
- curioso
- social

Cada perfil influye en el tipo de vino sugerido.

---

## Ocasión

El sistema debe detectar para qué momento se busca el vino.

Ejemplos:

- comida
- asado
- picada
- regalo
- cena especial
- tomar solo
- descubrir algo nuevo

La ocasión cambia completamente la recomendación.

---

## Presupuesto

El presupuesto puede venir de:

- precio explícito
- rango estimado
- intención del usuario

Ejemplos:

- vino económico
- gama media
- vino especial
- vino premium

El motor nunca debe recomendar vinos fuera del rango pedido.

---

## Estilo de vino

El estilo puede detectarse por:

- varietal mencionado
- tipo de vino
- preferencias del usuario

Ejemplos:

- Malbec
- Cabernet
- Pinot Noir
- Blend
- Espumoso
- Blanco

---

# Lógica de recomendación

El motor debe seguir esta secuencia:

1. identificar intención
2. detectar variables disponibles
3. completar variables faltantes con preguntas
4. generar recomendaciones coherentes

Nunca recomendar vinos sin contexto.

---

# Número de recomendaciones

El sistema debe sugerir:

mínimo 1 vino  
máximo 3 vinos

Nunca más de 3.

Demasiadas opciones generan confusión.

---

# Estructura de recomendación

Cuando se recomiende vino, usar esta estructura:

Introducción breve

Lista corta de vinos

Explicación breve de cada vino

Pregunta de seguimiento

---

# Ejemplo de recomendación

Usuario:
Quiero un vino de 20 mil pesos

Respuesta esperada:

Si querés moverte cerca de los $20.000, hay varias opciones que pueden funcionar bien.

Trumpeter Malbec suele ser muy versátil y fácil de recomendar en ese rango.

También podrías mirar Zuccardi Serie A Malbec si buscás algo un poco más gastronómico.

¿Lo querés para comida o para tomar solo?

---

# Lógica para cajas

Cuando el usuario pide una caja o selección, el sistema debe armar una combinación equilibrada.

Regla sugerida:

vino seguro  
vino interesante  
vino especial

Esto genera una experiencia más rica.

---

# Ejemplo de caja

Para regalo suele funcionar bien una selección equilibrada.

Por ejemplo:

un Malbec clásico fácil de tomar  
un vino un poco más gastronómico  
y una etiqueta con algo distinto

Así la caja se siente bien pensada sin volverse demasiado rara.

---

# Wine Tinder

Wine Tinder debe servir para detectar perfil.

Variables a usar:

- estilos preferidos
- rechazos
- elecciones positivas

A partir de eso el sistema detecta el perfil.

Ejemplo de resultado:

Perfil Clásico Malbec  
Perfil Explorador  
Perfil Elegante  

Ese perfil luego influye en futuras recomendaciones.

---

# Integración con Sommelier IA

El Sommelier IA debe usar este motor.

El flujo recomendado:

Usuario responde quiz  
Sistema detecta perfil  
Sistema sugiere vinos  
Sistema propone caja  
Sistema propone mensualidad

---

# Integración con el Club

El sistema puede recomendar club cuando detecte:

- interés en descubrir vinos
- interés en selección curada
- interés en cajas

Pero nunca debe empujar el club de forma agresiva.

---

# Uso del catálogo

Todas las recomendaciones deben usar el catálogo real:

vinos_lombardo_base.json

Nunca inventar vinos.

Nunca recomendar vinos inexistentes.

---

# Aprendizaje del sistema

El sistema puede mejorar si registra:

- preguntas frecuentes
- perfiles detectados
- recomendaciones aceptadas
- consultas de precio

Esto permite mejorar recomendaciones futuras.

---

# Regla final

Un buen sommelier no recomienda por cantidad.

Recomienda por criterio.

El motor de Lombardo debe hacer exactamente eso.
