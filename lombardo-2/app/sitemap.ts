import type { MetadataRoute } from "next";
import { commerceProvider } from "@/lib/commerce";
import { SITE } from "@/lib/config/site";
import { SEO_CATEGORIES } from "@/lib/seo/categories";
import { PUBLISHED_GUIDES } from "@/lib/seo/guides";

const foundationUpdatedAt = new Date("2026-08-29T00:00:00-03:00");

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (process.env.VERCEL_ENV !== "production") return [];

  const staticEntries: MetadataRoute.Sitemap = [
    {
      url: SITE.url,
      lastModified: foundationUpdatedAt,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE.url}/productos`,
      lastModified: foundationUpdatedAt,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${SITE.url}/guias`,
      lastModified: foundationUpdatedAt,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${SITE.url}/cava-secreta`,
      changeFrequency: "daily",
      priority: 0.6,
    },
    ...SEO_CATEGORIES.map((category) => ({
      url: `${SITE.url}/categorias/${category.slug}`,
      lastModified: foundationUpdatedAt,
      changeFrequency: "daily" as const,
      priority: category.slug === "vinos" ? 0.9 : 0.8,
    })),
    ...PUBLISHED_GUIDES.map((guide) => ({
      url: `${SITE.url}/guias/${guide.slug}`,
      lastModified: new Date(`${guide.updatedAt}T00:00:00-03:00`),
      changeFrequency: "weekly" as const,
      priority: guide.intent === "transaccional" ? 0.85 : 0.8,
    })),
  ];

  try {
    const products = await commerceProvider.getIndexableProducts();
    return [
      ...staticEntries,
      ...products.map((product) => ({
        url: `${SITE.url}/productos/${product.slug}`,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      })),
    ];
  } catch (error) {
    console.error("[seo] product sitemap unavailable", {
      error: error instanceof Error ? error.message : "unknown",
    });
    return staticEntries;
  }
}
