import type {
  OrderRepositoryErrorCode,
  PriceChange,
} from "../../../types/checkout.ts";

export class ServerOrderError extends Error {
  readonly code: OrderRepositoryErrorCode;
  readonly status: number;
  readonly priceChanges?: PriceChange[];

  constructor(
    code: OrderRepositoryErrorCode,
    message: string,
    options: { status?: number; priceChanges?: PriceChange[] } = {},
  ) {
    super(message);
    this.name = "ServerOrderError";
    this.code = code;
    this.status = options.status ?? 400;
    this.priceChanges = options.priceChanges;
  }
}
