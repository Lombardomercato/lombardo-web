# Diagnóstico: por qué la IA no responde según las configuraciones Markdown

Fecha: 2026-03-11

## Hallazgos clave

1. **No se cargan "todos" los MD del proyecto**, solo un subconjunto hardcodeado.
   - El backend solo lee 7 archivos definidos en `DOC_FILES`.
   - Cualquier otro `.md` (por ejemplo `ai/intent-detection/ai-instructions.md`) **no entra** al prompt de sistema.

2. **Los documentos sí se leen, pero se recortan agresivamente**.
   - Cada archivo pasa por `clip(...)` con límites por archivo (ejemplo: `AI_SYSTEM_PROMPT_LOMBARDO.md` limitado a 5000 chars).
   - En la práctica, se pierde parte de las reglas que están al final de varios documentos.

3. **Se altera el formato del contenido antes de enviarlo al modelo**.
   - `compact(...)` hace `trim` por línea y elimina líneas vacías.
   - Esto aplana estructura, jerarquía y separación visual de reglas, reduciendo claridad semántica.

4. **Hay solapamiento/competencia de instrucciones**.
   - Aunque se arma un prompt “canónico” desde docs, luego se concatena un bloque grande adicional (`SYSTEM_PROMPT`) y un `user prompt` con muchas reglas y ejemplos.
   - Cuando hay conflicto entre instrucciones, el modelo prioriza lo más reciente/específico, por lo que algunas reglas de los MD pueden quedar de facto debilitadas.

5. **Si falla la lectura de docs, el sistema degrada en silencio**.
   - `readDoc(...)` atrapa cualquier error y retorna `''` sin log.
   - Si hay problema de path/deploy/packaging, no hay visibilidad y se sigue con fallback.

6. **El prompt se cachea en memoria**.
   - `SYSTEM_PROMPT_CACHE` evita reconstruir el prompt tras el primer uso.
   - Si se actualizan MD en caliente sin reinicio/rehidratación del runtime, el modelo puede seguir usando versión vieja.

## Evidencia rápida

Comando usado para auditar la carga real:

```bash
node scripts/inspect-ai-prompt.js
```

Resultado observado:

- `docs/AI_SYSTEM_PROMPT_LOMBARDO.md`: ~8995 chars raw → **5000** usados.
- `docs/CONVERSATION_FLOW_LOMBARDO.md`: ~7744 raw → **4200** usados.
- `docs/AI_TONE_GUIDE_LOMBARDO.md`: ~5823 raw → **2800** usados.
- Prompt final ensamblado desde docs: **22370 chars**.

## Conclusión

El problema no parece ser “los MD no existen”, sino **cómo se ingieren y priorizan**:

- solo algunos MD están conectados,
- se recortan,
- se compactan,
- y compiten con prompts adicionales hardcodeados.

Eso explica por qué la respuesta puede desviarse de la configuración esperada aunque los archivos estén “cargados” en repositorio.

## Recomendaciones (prioridad)

1. **Eliminar o subir límites de `clip(...)`** para no truncar reglas críticas.
2. **No compactar agresivamente** (preservar saltos de línea estructurales).
3. **Incluir explícitamente todos los MD que deben gobernar comportamiento** (o definir un manifiesto canónico único).
4. **Agregar logging de diagnóstico**: qué archivos se cargaron, cuántos chars entraron, si hubo fallback.
5. **Reducir duplicación de instrucciones** entre docs y prompts hardcodeados para evitar contradicciones.
6. **Invalidar cache al detectar cambios** o reconstruir prompt periódicamente en entorno serverless.
