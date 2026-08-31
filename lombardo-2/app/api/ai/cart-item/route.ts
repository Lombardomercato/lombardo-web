import { z } from "zod";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { readJsonBody } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1).max(24).default(1),
}).strict();

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await readJsonBody(request, 2_048, "La solicitud es demasiado grande."));
    const pricing = await getCurrentCustomerPricingContext();
    const products = await commerceProvider.getProductsByIds([input.productId], pricing);
    const product = products[0];
    if (!product?.active || !product.stock.available || product.price <= 0) {
      return Response.json(
        { error: "Este producto ya no está disponible." },
        { status: 404, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(
      { product, quantity: input.quantity },
      { headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } },
    );
  } catch {
    return Response.json(
      { error: "No pudimos revalidar el producto." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
