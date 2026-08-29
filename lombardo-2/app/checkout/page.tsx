import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";
import {
  getCurrentCustomerAccount,
  getCurrentCustomerPricingContext,
} from "@/lib/server/customers/customer-auth";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Completá tus datos y prepará tu pedido Lombardo.",
  robots: { index: false, follow: false },
};

export default async function CheckoutRoute() {
  const [account, pricingContext] = await Promise.all([
    getCurrentCustomerAccount(),
    getCurrentCustomerPricingContext(),
  ]);
  return (
    <CheckoutPage
      pricingContextKey={pricingContext.contextKey}
      customerDefaults={
        account
          ? {
              name: account.name,
              email: account.email,
              whatsapp: account.whatsapp,
            }
          : undefined
      }
    />
  );
}
