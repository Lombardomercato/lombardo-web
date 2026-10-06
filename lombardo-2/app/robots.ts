import type { MetadataRoute } from "next";
import { SITE } from "@/lib/config/site";
import { isMaintenanceModeEnabled } from "@/lib/maintenance";

export default function robots(): MetadataRoute.Robots {
  if (
    process.env.VERCEL_ENV !== "production" ||
    isMaintenanceModeEnabled()
  ) {
    return {
      rules: { userAgent: "*", disallow: "/" },
    };
  }

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/api/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
