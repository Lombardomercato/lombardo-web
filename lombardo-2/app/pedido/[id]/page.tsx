import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OrderStatusPage } from "@/components/order/OrderStatusPage";
import { buildWhatsAppCoordinationUrl } from "@/lib/checkout/whatsapp-coordination";
import type { ReturnHint } from "@/lib/order-status/presentation";
import { createOrderServices } from "@/lib/server/services";

export const metadata: Metadata = {
  title: "Estado del pedido",
  description: "Consultá el estado de tu pedido Lombardo.",
};

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function OrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ return?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!publicIdPattern.test(id)) notFound();

  const { orders } = createOrderServices();
  const order = await orders.getByPublicId(id);
  if (!order) notFound();

  const returnHint = ["success", "pending", "failure"].includes(query.return ?? "")
    ? (query.return as ReturnHint)
    : undefined;
  const whatsappUrl =
    order.paymentMethod === "whatsapp_coordination"
      ? buildWhatsAppCoordinationUrl(
          order,
          process.env.NEXT_PUBLIC_WHATSAPP_URL,
        ) ?? undefined
      : undefined;
  return (
    <OrderStatusPage
      order={orders.toPublicStatus(order)}
      returnHint={returnHint}
      whatsappUrl={whatsappUrl}
    />
  );
}
