import { NextResponse } from "next/server";
import {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
  commerceProvider,
} from "@/lib/commerce";
import { getRequestId, logCommerceError } from "@/lib/server/dev-commerce-logger";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";
import {
  resolveVolumeTierProducts,
  wholesaleTierPricingContext,
} from "@/lib/pricing/volume-tier";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestId = getRequestId(request);
  const searchParams = new URL(request.url).searchParams;
  const ids = searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  const quantityById = new Map(
    (searchParams.get("quantities") ?? "")
      .split(",")
      .flatMap((entry) => {
        const separator = entry.lastIndexOf(":");
        const productId = entry.slice(0, separator);
        const quantity = Number(entry.slice(separator + 1));
        return ids?.includes(productId) && Number.isInteger(quantity) && quantity > 0 && quantity <= 99
          ? [[productId, quantity] as const]
          : [];
      }),
  );

  try {
    const startedAt = performance.now();
    const pricingContext = await getCurrentCustomerPricingContext();
    if (ids?.length) {
      const baseProducts = await commerceProvider.getProductsByIds(
        ids.slice(0, 99),
        pricingContext,
      );
      const { products } = await resolveVolumeTierProducts({
        products: baseProducts,
        quantities: ids.map((productId) => ({
          productId,
          quantity: quantityById.get(productId) ?? 0,
        })),
        pricingContext,
        loadWholesale: (productIds) => commerceProvider.getProductsByIds(
          productIds,
          wholesaleTierPricingContext(pricingContext),
        ),
      });
      const requestTimeMs = Math.round((performance.now() - startedAt) * 10) / 10;
      return NextResponse.json(
        { products, requestTimeMs },
        {
          headers: {
            "Cache-Control": "private, no-store",
            "Server-Timing": `catalog;dur=${requestTimeMs}`,
            "X-Request-ID": requestId,
          },
        },
      );
    }

    const categories = await commerceProvider.getCategories();
    const requestedCategory = searchParams.get("category")?.trim();
    const categorySlug = categories.some(
      (category) => category.slug === requestedCategory,
    )
      ? requestedCategory
      : undefined;
    const offset = Math.max(
      0,
      Math.trunc(Number(searchParams.get("offset")) || 0),
    );
    const requestedLimit = Math.trunc(
      Number(searchParams.get("limit")) || CATALOG_PAGE_SIZE,
    );
    const limit = Math.min(
      Math.max(requestedLimit, 1),
      CATALOG_MAX_PAGE_SIZE,
    );
    const page = await commerceProvider.getProductPage(
      {
        offset,
        limit,
        search: searchParams.get("q")?.trim() || undefined,
        categorySlug,
      },
      pricingContext,
    );
    const requestTimeMs = Math.round((performance.now() - startedAt) * 10) / 10;
    return NextResponse.json(
      { ...page, requestTimeMs },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `catalog;dur=${requestTimeMs}, source;dur=${page.queryTimeMs}`,
          "X-Request-ID": requestId,
        },
      },
    );
  } catch (error) {
    logCommerceError("catalog.request_failed", error, {
      requestId,
      route: "/api/catalog",
    });
    return NextResponse.json(
      { error: "No pudimos actualizar el catálogo." },
      {
        status: 503,
        headers: {
          "Cache-Control": "private, no-store",
          "X-Request-ID": requestId,
        },
      },
    );
  }
}
