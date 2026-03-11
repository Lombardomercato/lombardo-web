# AI_LEARNING_LAYER_LOMBARDO

## Objetivo

Este documento define la capa de aprendizaje del Asistente IA Lombardo.

La idea no es que la IA se "reentrene sola" sin control, sino que el sistema pueda aprender de las preguntas reales de los usuarios para mejorar:

- recomendaciones
- cierres
- sugerencias de cajas
- sugerencias de mensualidad
- comprensión de intención
- conocimiento comercial del negocio

---

## Principio general

Cada interacción relevante del usuario debe dejar una señal útil.

El sistema debe registrar patrones para entender:

- qué busca la gente
- qué perfiles predominan
- qué preguntas se repiten
- qué recomendaciones funcionan mejor
- qué temas terminan en WhatsApp
- qué oportunidades aparecen

---

## Qué registrar

Cada interacción del asistente debería poder guardar, cuando sea posible:

- fecha
- mensaje_usuario
- pagina_actual
- intencion_detectada
- perfil_detectado
- categoria_consulta
- productos_sugeridos
- tipo_cierre
- derivo_whatsapp

---

## Ejemplo de registro

```json
{
  "fecha": "2026-03-10",
  "mensaje_usuario": "Quiero un vino para regalar",
  "pagina_actual": "home",
  "intencion_detectada": "consulta_producto",
  "perfil_detectado": "elegante",
  "categoria_consulta": "regalo",
  "productos_sugeridos": [
    "Rutini Cabernet Malbec",
    "Catena Alta Malbec"
  ],
  "tipo_cierre": "etiquetas",
  "derivo_whatsapp": true
}
