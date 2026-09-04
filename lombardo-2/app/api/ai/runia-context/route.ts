import { createPricingAssertion, readRuniaCommerceBridgeConfiguration } from "@/lib/server/ai/runia-bridge";
import { getCurrentCustomerPricingContext } from "@/lib/server/customers/customer-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== "https://www.lombardomercato.com" && origin !== "https://lombardomercato.com") {
    return new Response(null, { status: 403 });
  }
  try {
    const [pricing, bridge] = await Promise.all([
      getCurrentCustomerPricingContext(),
      Promise.resolve(readRuniaCommerceBridgeConfiguration()),
    ]);
    return Response.json({
      pricingAssertion: createPricingAssertion(pricing, bridge),
      pricingPolicy: pricing.policy,
      expiresIn: 600,
    }, {
      headers: {
        "Cache-Control": "no-store, max-age=0",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "RUNIA_CONTEXT_UNAVAILABLE" }, { status: 503 });
  }
}
