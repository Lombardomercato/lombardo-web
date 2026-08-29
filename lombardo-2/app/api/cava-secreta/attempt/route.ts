import { createSecretCellarService, SecretCellarInputError } from "@/lib/server/secret-cellar/secret-cellar-service";
import { SecretCellarStoreError } from "@/lib/server/secret-cellar/secret-cellar-store";
import { noStoreJson } from "@/lib/server/http-response";
import { checkRateLimit, getRequestIp } from "@/lib/server/rate-limit";

function parseBody(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  const challengeId = typeof body.challengeId === "string" ? body.challengeId.trim() : "";
  const selectedProductId = typeof body.selectedProductId === "string" ? body.selectedProductId.trim() : "";
  const guestContactKind: "EMAIL" | "WHATSAPP" | undefined =
    body.guestContactKind === "EMAIL" || body.guestContactKind === "WHATSAPP"
    ? body.guestContactKind
    : undefined;
  const guestContact = typeof body.guestContact === "string"
    ? body.guestContact.trim().slice(0, 254)
    : undefined;
  return { challengeId, selectedProductId, guestContactKind, guestContact };
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return noStoreJson({ message: "No pudimos validar la solicitud." }, { status: 403 });
  }
  const rateLimit = checkRateLimit(`secret-cellar:${getRequestIp(request)}`, {
    limit: 12,
    windowMs: 10 * 60_000,
  });
  if (!rateLimit.allowed) {
    return noStoreJson(
      { message: "La puerta de la cava necesita un momento. Probá de nuevo más tarde." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = null;
  }
  const input = parseBody(body);
  if (!input) return noStoreJson({ message: "La selección no es válida." }, { status: 400 });

  try {
    const result = await createSecretCellarService().submitAttempt(input);
    return noStoreJson(result);
  } catch (error) {
    if (error instanceof SecretCellarInputError || error instanceof SecretCellarStoreError) {
      return noStoreJson({ message: error.message }, { status: error.status });
    }
    return noStoreJson(
      { message: "La cava no pudo comprobar la botella. Probá de nuevo en un momento." },
      { status: 503 },
    );
  }
}
