import type { Metadata } from "next";
import { CheckoutPage } from "@/components/checkout/CheckoutPage";

export const metadata: Metadata = {
  title: "Checkout",
  description: "Completá tus datos y prepará tu pedido Lombardo.",
};

export default function CheckoutRoute() {
  return <CheckoutPage />;
}
