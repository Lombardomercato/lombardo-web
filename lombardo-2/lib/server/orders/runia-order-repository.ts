import type {
  CartValidationResult,
  CreateOrderInput,
  OrderDraft,
  OrderItemSnapshot,
  PriceChange,
  PublicOrderStatus,
} from "../../../types/checkout.ts";
import type {
  AtomicInsertResult,
  RuniaOrderStore,
  ServerDeliveryPricing,
  ServerOrderRepository,
  ServerProductSource,
} from "./order-dependencies.ts";
import { ServerOrderError } from "./server-order-error.ts";

interface RuniaOrderRepositoryOptions {
  tenantId: string;
  productSource: ServerProductSource;
  deliveryPricing: ServerDeliveryPricing;
  store: RuniaOrderStore;
}

export class RuniaOrderRepository implements ServerOrderRepository {
  private readonly tenantId: string;
  private readonly productSource: ServerProductSource;
  private readonly deliveryPricing: ServerDeliveryPricing;
  readonly store: RuniaOrderStore;

  constructor(options: RuniaOrderRepositoryOptions) {
    this.tenantId = options.tenantId;
    this.productSource = options.productSource;
    this.deliveryPricing = options.deliveryPricing;
    this.store = options.store;
  }

  async validateCart(input: CreateOrderInput): Promise<CartValidationResult> {
    if (!input.items.length) {
      return {
        valid: false,
        code: "EMPTY_CART",
        message: "Tu carrito está vacío. Volvé al catálogo para elegir algo.",
      };
    }

    const products = await this.productSource.getProductsByIds(
      input.items.map((item) => item.productId),
    );
    const productMap = new Map(products.map((product) => [product.id, product]));
    const snapshots: OrderItemSnapshot[] = [];
    const priceChanges: PriceChange[] = [];

    for (const item of input.items) {
      const product = productMap.get(item.productId);
      if (!product || !product.active) {
        return {
          valid: false,
          code: "INVALID_PRODUCT",
          productId: item.productId,
          message: "Uno de los productos ya no existe o no está activo.",
        };
      }
      if (product.availability === "UNAVAILABLE") {
        return {
          valid: false,
          code: "PRODUCT_UNAVAILABLE",
          productId: product.id,
          message: `${product.name} ya no está disponible. Revisá tu carrito.`,
        };
      }
      if (
        product.availability === "AVAILABLE_NOW" &&
        (!product.stock.available || product.stock.quantity < item.quantity)
      ) {
        return {
          valid: false,
          code: "QUANTITY_INVALID",
          productId: product.id,
          message: `No tenemos la cantidad solicitada de ${product.name}.`,
        };
      }
      if (product.price !== item.expectedUnitPrice) {
        priceChanges.push({
          productId: product.id,
          name: product.name,
          expectedUnitPrice: item.expectedUnitPrice,
          currentUnitPrice: product.price,
        });
      }
      snapshots.push({
        productId: product.id,
        sourceProductId: product.sourceProductId,
        sku: product.sku,
        name: product.name,
        unitPrice: product.price,
        quantity: item.quantity,
        lineTotal: product.price * item.quantity,
      });
    }

    if (priceChanges.length) {
      return {
        valid: false,
        code: "PRICE_CHANGED",
        message: "Actualizamos los precios del carrito. Revisá el nuevo total.",
        priceChanges,
      };
    }

    return { valid: true, items: snapshots };
  }

  async createOrder(input: CreateOrderInput): Promise<AtomicInsertResult> {
    const existing = await this.store.findByIdempotency(
      this.tenantId,
      input.checkoutSessionId,
      input.idempotencyKey,
    );
    if (existing) return { order: existing, reused: true };

    const validation = await this.validateCart(input);
    if (!validation.valid) {
      throw new ServerOrderError(validation.code, validation.message, {
        status: validation.code === "PRICE_CHANGED" ? 409 : 422,
        priceChanges: validation.priceChanges,
      });
    }

    const deliveryQuote = this.deliveryPricing.getQuote(input.deliveryMethod);
    const subtotal = validation.items.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );

    return this.store.insertOrderAtomic({
      publicId: crypto.randomUUID(),
      tenantId: this.tenantId,
      checkoutSessionId: input.checkoutSessionId,
      idempotencyKey: input.idempotencyKey,
      items: validation.items,
      customer: input.customer,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress:
        input.deliveryMethod === "DELIVERY" ? input.deliveryAddress : undefined,
      deliveryCostMode: deliveryQuote.mode,
      subtotal,
      deliveryCost: deliveryQuote.amount,
      total: subtotal + deliveryQuote.amount,
      currency: "ARS",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
    });
  }

  getByPublicId(publicId: string) {
    return this.store.getByPublicId(this.tenantId, publicId);
  }

  getById(orderId: string) {
    return this.store.getById(this.tenantId, orderId);
  }

  savePaymentPreference(
    orderId: string,
    preferenceId: string,
    checkoutUrl: string,
  ) {
    return this.store.savePaymentPreference(
      this.tenantId,
      orderId,
      preferenceId,
      checkoutUrl,
    );
  }

  toPublicStatus(order: OrderDraft): PublicOrderStatus {
    return {
      publicId: order.publicId,
      displayId: order.publicId.slice(0, 8).toUpperCase(),
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      deliveryMethod: order.deliveryMethod,
      deliveryCostMode: order.deliveryCostMode,
      total: order.total,
      currency: order.currency,
      paymentCheckoutUrl: order.paymentCheckoutUrl,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
