import { createAdminStore, getOptionalAdminSession } from "@/lib/server/admin/admin-auth";
import { noStoreJson } from "@/lib/server/http-response";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getOptionalAdminSession();
  if (!session) return noStoreJson({ error: "Sesión vencida." }, { status: 401 });
  const search = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (search.length < 2 || search.length > 80) {
    return noStoreJson({ products: [] });
  }
  try {
    const products = await createAdminStore().searchOrderProducts(search);
    return noStoreJson({
      products: products.map((product) => ({
        id: product.id,
        sku: product.sku,
        name: product.name,
        presentation: product.presentation,
        retailPrice: product.retailPrice,
      })),
    });
  } catch {
    return noStoreJson(
      { error: "No pudimos buscar productos en Runia." },
      { status: 503 },
    );
  }
}
