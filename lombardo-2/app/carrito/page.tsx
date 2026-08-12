import type { Metadata } from "next";
import { CartPage } from "@/components/cart/CartPage";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisá tu selección Lombardo antes de continuar.",
  robots: { index: false, follow: false },
};

export default function CartRoute() {
  return <CartPage />;
}
