# Activación controlada de Mercado Pago LIVE

## Preconditions

- Incidente de Sandbox documentado y escalado a soporte, sin nuevos intentos TEST.
- `www.lombardomercato.com` sirviendo el deployment Production esperado.
- Runia Production y tenant `lombardo` operativos.
- El canal `whatsapp_coordination` continúa disponible.

## Variables server-only de Vercel Production

```text
APP_URL=https://www.lombardomercato.com
MERCADO_PAGO_MODE=LIVE
MERCADO_PAGO_SELLER_ID=<seller oficial de Lombardo>
MERCADO_PAGO_ACCESS_TOKEN=<Access Token productivo>
MERCADO_PAGO_WEBHOOK_SECRET=<firma LIVE del webhook>
PAYMENTS_ENABLED=false
```

El Access Token y la firma nunca se versionan ni usan variables `NEXT_PUBLIC_*`.
`pnpm live:check` valida la cuenta y el país mediante `/users/me`, sin crear una
preferencia ni intentar un cobro.

La preparación LIVE no depende de simular un pago aprobado. El primer cobro real
sólo se ejecuta después de la autorización final y con una única compra controlada.

## Webhook

Configurar en la aplicación oficial:

```text
https://www.lombardomercato.com/api/payments/mercadopago/webhook
```

Mantener `PAYMENTS_ENABLED=false` hasta recibir la autorización literal:

```text
AUTORIZO PRIMER PAGO LIVE CONTROLADO.
```

Recién después se cambia el flag a `true`, se redespliega y se ejecuta una única
compra controlada. El fallback de WhatsApp no se desactiva.
