import { getOptionalAdminSession, createAdminStore } from "@/lib/server/admin/admin-auth";
import { AdminStoreError } from "@/lib/server/admin/runia-admin-store";

export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

function validImage(bytes: Uint8Array, mime: string) {
  if (mime === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mime === "image/png") return bytes.slice(0, 8).every((value, index) => value === [137, 80, 78, 71, 13, 10, 26, 10][index]);
  const ascii = new TextDecoder("ascii").decode(bytes.slice(0, 16));
  if (mime === "image/webp") return ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP";
  if (mime === "image/avif") return ascii.slice(4, 12) === "ftypavif" || ascii.slice(4, 12) === "ftypavis";
  return false;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getOptionalAdminSession();
  if (!session) return Response.json({ error: "Sesión vencida." }, { status: 401 });
  try {
    const productId = (await params).id;
    const form = await request.formData();
    const file = form.get("image");
    const altText = String(form.get("altText") || "").trim().slice(0, 240);
    const sourceUrl = String(form.get("sourceUrl") || "").trim().slice(0, 2000);
    const makePrimary = form.get("makePrimary") === "true";
    if (!(file instanceof File) || file.size < 20 || file.size > MAX_BYTES || !altText) {
      return Response.json({ error: "Elegí una imagen válida de hasta 5 MB y escribí el texto alternativo." }, { status: 422 });
    }
    if (sourceUrl && (!sourceUrl.startsWith("https://") || !URL.canParse(sourceUrl))) {
      return Response.json({ error: "La fuente debe ser una URL HTTPS válida." }, { status: 422 });
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!validImage(bytes, file.type)) {
      return Response.json({ error: "El contenido del archivo no coincide con una imagen JPG, PNG, WebP o AVIF." }, { status: 422 });
    }
    await createAdminStore().uploadProductImage({
      productId,
      bytes,
      mimeType: file.type,
      altText,
      sourceUrl: sourceUrl || undefined,
      makePrimary,
      operatorUserId: session.authUserId,
    });
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof AdminStoreError ? error.message : "No pudimos subir la imagen.";
    const status = error instanceof AdminStoreError ? error.status : 500;
    return Response.json({ error: message }, { status });
  }
}
