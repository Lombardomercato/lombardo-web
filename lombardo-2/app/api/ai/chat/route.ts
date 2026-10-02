export const dynamic = "force-dynamic";

export async function POST() {
  return Response.json(
    { error: "WEB_ASSISTANT_DISABLED" },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
