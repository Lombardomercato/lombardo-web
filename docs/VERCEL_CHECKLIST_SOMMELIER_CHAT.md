# Checklist de Vercel — `/api/sommelier-chat`

Checklist operativo para diagnosticar y dejar estable el chat IA en producción.

---

## 1) Variables de entorno (Project Settings → Environment Variables)

Configurar en **Production**, **Preview** y **Development**:

- `OPENAI_API_KEY`
  - Valor: clave válida de OpenAI (sin comillas, sin espacios).
  - Verificación rápida: no debe estar vacía ni comenzar con `sk-proj-...` incompleta.

- `OPENAI_MODEL` (opcional)
  - Valor recomendado: `gpt-4o-mini`.
  - Si no se define, el backend ya usa ese valor por defecto.

- `AI_INTERACTIONS_FILE` (opcional)
  - Recomendación para Vercel: **no definirla** o apuntarla a `/tmp/ai-interactions.jsonl`.
  - Evitar rutas de solo lectura dentro del bundle/deploy.

> Nota: en Vercel, escribir en disco fuera de `/tmp` puede fallar por permisos.

---

## 2) Redeploy obligatorio

Cada cambio de variables requiere redeploy para tomar efecto:

1. Guardar variables.
2. Ir a **Deployments**.
3. Ejecutar **Redeploy** del deployment activo.

---

## 3) Smoke test del endpoint en producción

Probar desde terminal:

```bash
curl -i -X POST "https://<tu-dominio>/api/sommelier-chat" \
  -H "Content-Type: application/json" \
  -d '{"message":"Quiero un malbec para asado","pagina_actual":"sommelier","history":[]}'
```

Esperado:

- HTTP `200` en caso normal.
- Body JSON con `reply`.
- Campo `fallback`:
  - `{"used": false, "mode": "openai"}` cuando OpenAI responde bien.
  - `{"used": true, "mode": "local"}` si falta `OPENAI_API_KEY`.
  - `{"used": true, "mode": "openai-error-fallback"}` si OpenAI falla.

Si falla, el endpoint debe responder JSON consistente:

```json
{
  "error": true,
  "message": "detalle breve",
  "error_code": "..."
}
```

---

## 4) Logs que tenés que revisar en Vercel (Runtime Logs)

Buscar estas trazas del backend:

- `[sommelier-chat][debug] request recibido`
- `[sommelier-chat][debug] validando payload`
- `[sommelier-chat][debug] cargando catálogo`
- `[sommelier-chat][debug] cargando prompt canónico`
- `[sommelier-chat][debug] iniciando llamada a OpenAI`
- `[sommelier-chat][debug] OpenAI fallback activado por error:`
- `[sommelier-chat][debug] usando fallback local por OPENAI_API_KEY faltante`
- `[sommelier-chat][<ERROR_CODE>] error en catch final`

Con eso podés aislar si el origen es:

- **Config OpenAI** (`OPENAI_API_KEY` faltante)
- **HTTP OpenAI** (`OPENAI_HTTP_ERROR`)
- **Parse OpenAI** (`OPENAI_PARSE_ERROR`)
- **Catálogo** (`WINE_CATALOG_PARSE_ERROR` / `WINE_CATALOG_NOT_FOUND`)
- **Prompt canónico/docs** (`CANONICAL_PROMPT_BUILD_ERROR` / `ENOENT`)

---

## 5) Logs útiles en frontend (DevTools del navegador)

En consola del sitio, al fallar request del widget, validar que aparezca:

- `[assistant-widget][debug] status: ...`
- `[assistant-widget][debug] statusText: ...`
- `[assistant-widget][debug] response body: ...`
- `[assistant-widget][debug] request fallida: ...`

Esto evita el caso de ver solo `Object` y acelera el diagnóstico.

---

## 6) Checklist de resolución rápida (runbook)

1. Confirmar `OPENAI_API_KEY` cargada en Vercel y redeploy hecho.
2. Ejecutar `curl` al endpoint productivo.
3. Si `fallback.mode = local`, revisar variable faltante.
4. Si `fallback.mode = openai-error-fallback`, revisar `error_code` y runtime logs.
5. Si responde 500, verificar JSON (`error`, `message`, `error_code`) y ubicar traza de catch final.
6. Validar desde frontend que se muestren `status/statusText/body`.
7. Confirmar que UX se mantiene gracias al fallback local mientras se corrige causa raíz.
