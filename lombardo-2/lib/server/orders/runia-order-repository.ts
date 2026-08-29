import type {
  CartValidationResult,
  CreateOrderInput,
  OrderDraft,
  OrderItemSnapshot,
  PaymentMethod,
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
import type { CustomerPricingContext } from "../customers/types.ts";
import { roundCurrency } from "../../pricing/policy.ts";

interface RuniaOrderRepositoryOptions {
  tenantId: string;
  pricingContext: CustomerPricingContext;
  productSource: ServerProductSource;
  deliveryPricing: ServerDeliveryPricing;
  store: RuniaOrderStore;
}

export class RuniaOrderRepository implements ServerOrderRepository {
  private readonly tenantId: string;
  private readonly pricingContext: CustomerPricingContext;
  private readonly productSource: ServerProductSource;
  private readonly deliveryPricing: ServerDeliveryPricing;
  readonly store: RuniaOrderStore;

  constructor(options: RuniaOrderRepositoryOptions) {
    this.tenantId = options.tenantId;
    this.pricingContext = options.pricingContext;
    this.productSource = options.productSource;
    this.deliveryPricing = options.deliveryPricing;
    this.store = options.store;
  }

  private matchesPricingIdentity(order: OrderDraft) {
    return (
      (order.customerAccountId ?? null) ===
        (this.pricingContext.customerAccountId ?? null) &&
      order.pricingPolicy === this.pricingContext.policy &&
      order.discountPercent === this.pricingContext.discountPercent
    );
  }

  private assertPricingIdentity(order: OrderDraft) {
    if (!this.matchesPricingIdentity(order)) {
      throw new ServerOrderError(
        "DUPLICATE_SESSION",
        "La sesión de checkout pertenece a otra cuenta o política. Recargá el carrito.",
        { status: 409 },
      );
    }
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
        baseUnitPrice: product.basePrice,
        priceType: product.priceType,
        pricingPolicy: product.pricingPolicy,
        discountPercent: product.discountPercent,
        discountAmount: roundCurrency(product.basePrice - product.price),
        unitPrice: product.price,
        quantity: item.quantity,
        lineBaseTotal: roundCurrency(product.basePrice * item.quantity),
        lineDiscount: roundCurrency(
          (product.basePrice - product.price) * item.quantity,
        ),
        lineTotal: roundCurrency(product.price * item.quantity),
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
    if (existing) {
      this.assertPricingIdentity(existing);
      return { order: existing, reused: true };
    }

    const validation = await this.validateCart(input);
    if (!validation.valid) {
      throw new ServerOrderError(validation.code, validation.message, {
        status: validation.code === "PRICE_CHANGED" ? 409 : 422,
        priceChanges: validation.priceChanges,
      });
    }

    const deliveryQuote = this.deliveryPricing.getQuote(input.deliveryMethod);
    const baseSubtotal = roundCurrency(validation.items.reduce(
      (sum, item) => sum + item.lineBaseTotal,
      0,
    ));
    const pricingDiscountAmount = roundCurrency(validation.items.reduce(
      (sum, item) => sum + item.lineDiscount,
      0,
    ));
    const subtotal = roundCurrency(validation.items.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    ));

    if (!this.pricingContext.tenantRecordId) {
      throw new ServerOrderError(
        "SERVER_NOT_CONFIGURED",
        "Runia no pudo resolver el tenant del checkout.",
        { status: 503 },
      );
    }

    const result = await this.store.insertOrderAtomic({
      publicId: crypto.randomUUID(),
      tenantId: this.tenantId,
      tenantRecordId: this.pricingContext.tenantRecordId,
      customerAccountId: this.pricingContext.customerAccountId,
      pricingPolicy: this.pricingContext.policy,
      discountPercent: this.pricingContext.discountPercent,
      checkoutSessionId: input.checkoutSessionId,
      idempotencyKey: input.idempotencyKey,
      items: validation.items,
      customer: input.customer,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress:
        input.deliveryMethod === "DELIVERY" ? input.deliveryAddress : undefined,
      deliveryCostMode: deliveryQuote.mode,
      baseSubtotal,
      pricingDiscountAmount,
      subtotal,
      deliveryCost: deliveryQuote.amount,
      total: subtotal + deliveryQuote.amount,
      currency: "ARS",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
      paymentMethod: "mercado_pago",
    });
    if (result.reused) this.assertPricingIdentity(result.order);
    return result;
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

  savePaymentMethod(orderId: string, paymentMethod: PaymentMethod) {
    return this.store.savePaymentMethod(this.tenantId, orderId, paymentMethod);
  }

  toPublicStatus(order: OrderDraft): PublicOrderStatus {
    return {
      publicId: order.publicId,
      displayId: order.publicId.slice(0, 8).toUpperCase(),
      orderStatus: order.orderStatus,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
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
