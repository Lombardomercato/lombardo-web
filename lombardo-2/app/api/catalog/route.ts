import { NextResponse } from "next/server";
import {
  CATALOG_MAX_PAGE_SIZE,
  CATALOG_PAGE_SIZE,
  commerceProvider,
} from "@/lib/commerce";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const ids = searchParams
    .get("ids")
    ?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  try {
    const startedAt = performance.now();
    if (ids?.length) {
      const products = await commerceProvider.getProductsByIds(ids.slice(0, 99));
      const requestTimeMs = Math.round((performance.now() - startedAt) * 10) / 10;
      return NextResponse.json(
        { products, requestTimeMs },
        { headers: { "Server-Timing": `catalog;dur=${requestTimeMs}` } },
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
    const page = await commerceProvider.getProductPage({
      offset,
      limit,
      search: searchParams.get("q")?.trim() || undefined,
      categorySlug,
    });
    const requestTimeMs = Math.round((performance.now() - startedAt) * 10) / 10;
    return NextResponse.json(
      { ...page, requestTimeMs },
      {
        headers: {
          "Cache-Control": "private, no-store",
          "Server-Timing": `catalog;dur=${requestTimeMs}, runia;dur=${page.queryTimeMs}`,
        },
      },
    );
  } catch {
    return NextResponse.json(
      { error: "No pudimos actualizar el catálogo de Runia." },
      { status: 503 },
    );
  }
}
