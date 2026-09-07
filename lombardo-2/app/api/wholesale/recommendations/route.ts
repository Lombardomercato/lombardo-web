import { z } from "zod";
import { commerceProvider } from "@/lib/commerce";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import { readJsonBody } from "@/lib/server/request-body";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(30),
}).strict();

export async function POST(request: Request) {
  try {
    const input = bodySchema.parse(await readJsonBody(
      request,
      4_096,
      "La selección es demasiado grande.",
    ));
    const pricing = await getCurrentCustomerPricingContext();
    if (pricing.policy === "WHOLESALE" || pricing.policy === "BUSINESS") {
      return Response.json({ products: [] }, { headers: noStoreHeaders });
    }
    const selected = await commerceProvider.getProductsByIds(input.productIds, pricing);
    const eligible = selected.filter((product) => product.wholesaleEligible);
    if (!eligible.length) {
      return Response.json({ products: [] }, { headers: noStoreHeaders });
    }

    const categorySlug = dominantCategory(eligible.map((product) => product.category.slug));
    const targetPrice = eligible.reduce((sum, product) => sum + product.price, 0) / eligible.length;
    const page = await commerceProvider.getProductPage({
      categorySlug,
      limit: 96,
      requireImage: true,
    }, pricing);
    const selectedIds = new Set(input.productIds);
    const products = page.products
      .filter((product) =>
        product.wholesaleEligible &&
        !selectedIds.has(product.id) &&
        product.price >= targetPrice * 0.55 &&
        product.price <= targetPrice * 1.45,
      )
      .toSorted((left, right) =>
        Math.abs(left.price - targetPrice) - Math.abs(right.price - targetPrice),
      );
    const diverse = products.filter((product, index, all) =>
      all.findIndex((candidate) => candidate.brand.slug === product.brand.slug) === index,
    );
    return Response.json(
      { products: diverse.length >= 3 ? diverse.slice(0, 5) : [] },
      { headers: noStoreHeaders },
    );
  } catch {
    return Response.json(
      { products: [] },
      { status: 400, headers: noStoreHeaders },
    );
  }
}

const noStoreHeaders = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

function dominantCategory(categories: string[]) {
  const counts = new Map<string, number>();
  for (const category of categories) {
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].toSorted((left, right) => right[1] - left[1])[0]?.[0] ?? "vinos";
}
