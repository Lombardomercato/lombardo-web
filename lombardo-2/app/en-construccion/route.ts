import { renderMaintenancePage } from "@/lib/maintenance";

export function GET() {
  return new Response(renderMaintenancePage(), {
    status: 503,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "text/html; charset=utf-8",
      "Retry-After": "86400",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
