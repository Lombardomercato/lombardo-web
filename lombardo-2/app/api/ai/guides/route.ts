import { PUBLISHED_GUIDES } from "@/lib/seo/guides";

export const revalidate = 3600;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const query = normalize(params.get("q") ?? "").slice(0, 120);
  const limit = Math.min(Math.max(Number(params.get("limit")) || 3, 1), 5);
  if (query.length < 2) return Response.json({ guides: [] });
  const terms = query.split(/\s+/).filter((term) => term.length > 1);
  const guides = PUBLISHED_GUIDES.map((guide) => {
    const search = normalize([
      guide.title,
      guide.description,
      guide.eyebrow,
      guide.cluster,
      guide.catalog.search,
      ...(guide.catalog.searchTerms ?? []),
    ].filter(Boolean).join(" "));
    const matchedOn = terms.filter((term) => search.includes(term));
    return {
      slug: guide.slug,
      title: guide.cardTitle,
      description: guide.description,
      href: `/guias/${guide.slug}`,
      matchedOn,
    };
  })
    .filter((guide) => guide.matchedOn.length > 0)
    .sort((left, right) => right.matchedOn.length - left.matchedOn.length)
    .slice(0, limit);
  return Response.json(
    { guides },
    { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
  );
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR");
}
