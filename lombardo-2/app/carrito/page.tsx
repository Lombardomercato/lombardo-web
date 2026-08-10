import type { Metadata } from "next";
import { CartPage } from "@/components/cart/CartPage";

export const metadata: Metadata = {
  title: "Carrito",
  description: "Revisá tu selección Lombardo antes de continuar.",
};

export default function CartRoute() {
  return <CartPage />;
}
