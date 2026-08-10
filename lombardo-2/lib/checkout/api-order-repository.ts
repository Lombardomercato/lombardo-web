import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderRepositoryErrorPayload,
  PublicOrderStatus,
} from "@/types/checkout";
import {
  OrderRepositoryError,
  type OrderRepository,
} from "./order-repository";

async function readError(response: Response): Promise<OrderRepositoryErrorPayload> {
  try {
    return (await response.json()) as OrderRepositoryErrorPayload;
  } catch {
    return {
      code: "CREATE_FAILED",
      message: "No pudimos preparar el pedido. Probá nuevamente en unos minutos.",
    };
  }
}

export class ApiOrderRepository implements OrderRepository {
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const error = await readError(response);
      throw new OrderRepositoryError(error.code, error.message, {
        priceChanges: error.priceChanges,
      });
    }

    return (await response.json()) as CreateOrderResult;
  }

  async getOrderByPublicId(publicId: string): Promise<PublicOrderStatus | null> {
    const response = await fetch(`/api/orders/${encodeURIComponent(publicId)}`, {
      cache: "no-store",
    });
    if (response.status === 404) return null;
    if (!response.ok) {
      const error = await readError(response);
      throw new OrderRepositoryError(error.code, error.message);
    }
    return (await response.json()) as PublicOrderStatus;
  }
}
