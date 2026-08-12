import { ServerOrderError } from "./orders/server-order-error.ts";

function invalidBody(message: string, status = 400): never {
  throw new ServerOrderError("INVALID_REQUEST", message, { status });
}

export async function readJsonBody(
  request: Request,
  maximumBytes: number,
  tooLargeMessage: string,
) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    invalidBody(tooLargeMessage, 413);
  }

  if (!request.body) invalidBody("La solicitud recibida no es válida.");

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    totalBytes += value.byteLength;
    if (totalBytes > maximumBytes) {
      await reader.cancel();
      invalidBody(tooLargeMessage, 413);
    }
    chunks.push(value);
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)) as unknown;
  } catch {
    invalidBody("La solicitud recibida no contiene JSON válido.");
  }
}
