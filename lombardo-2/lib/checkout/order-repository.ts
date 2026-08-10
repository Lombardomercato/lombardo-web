import type {
  CreateOrderInput,
  CreateOrderResult,
  OrderRepositoryErrorCode,
  PriceChange,
  PublicOrderStatus,
} from "@/types/checkout";

export interface OrderRepository {
  createOrder(input: CreateOrderInput): Promise<CreateOrderResult>;
  getOrderByPublicId(publicId: string): Promise<PublicOrderStatus | null>;
}

export class OrderRepositoryError extends Error {
  readonly code: OrderRepositoryErrorCode;
  readonly priceChanges?: PriceChange[];

  constructor(
    code: OrderRepositoryErrorCode,
    message: string,
    options: { priceChanges?: PriceChange[] } = {},
  ) {
    super(message);
    this.name = "OrderRepositoryError";
    this.code = code;
    this.priceChanges = options.priceChanges;
  }
}
