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
import type { PromotionValidator } from "../promotions/promotion-service.ts";
import { normalizePromotionCode } from "../../promotions/engine.ts";
import { requiresDeliveryAddress } from "../../checkout/delivery-methods.ts";

interface RuniaOrderRepositoryOptions {
  tenantId: string;
  pricingContext: CustomerPricingContext;
  productSource: ServerProductSource;
  deliveryPricing: ServerDeliveryPricing;
  store: RuniaOrderStore;
  promotionService?: PromotionValidator;
}

export class RuniaOrderRepository implements ServerOrderRepository {
  private readonly tenantId: string;
  private readonly pricingContext: CustomerPricingContext;
  private readonly productSource: ServerProductSource;
  private readonly deliveryPricing: ServerDeliveryPricing;
  readonly store: RuniaOrderStore;
  private readonly promotionService?: PromotionValidator;

  constructor(options: RuniaOrderRepositoryOptions) {
    this.tenantId = options.tenantId;
    this.pricingContext = options.pricingContext;
    this.productSource = options.productSource;
    this.deliveryPricing = options.deliveryPricing;
    this.store = options.store;
    this.promotionService = options.promotionService;
  }

  private matchesPricingIdentity(order: OrderDraft) {
    return (
      (order.customerAccountId ?? null) ===
        (this.pricingContext.customerAccountId ?? null) &&
      order.pricingPolicy === this.pricingContext.policy &&
      order.discountPercent === this.pricingContext.discountPercent
    );
  }

  private assertPricingIdentity(order: OrderDraft, couponCode?: string) {
    const expectedCoupon = couponCode ? normalizePromotionCode(couponCode) : undefined;
    if (!this.matchesPricingIdentity(order) || order.couponCode !== expectedCoupon) {
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
        categorySlug: product.category.slug,
        baseUnitPrice: product.basePrice,
        priceType: product.priceType,
        pricingPolicy: product.pricingPolicy,
        discountPercent: product.discountPercent,
        discountAmount: roundCurrency(product.basePrice - product.price),
        commercialUnitPrice: product.price,
        policyDiscountAmount: roundCurrency(product.basePrice - product.price),
        couponDiscountAmount: 0,
        finalUnitPrice: product.price,
        unitPrice: product.price,
        quantity: item.quantity,
        lineBaseTotal: roundCurrency(product.basePrice * item.quantity),
        lineDiscount: roundCurrency(
          (product.basePrice - product.price) * item.quantity,
        ),
        lineCommercialTotal: roundCurrency(product.price * item.quantity),
        lineCouponDiscount: 0,
        lineFinalTotal: roundCurrency(product.price * item.quantity),
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

  async quotePromotion(code: string, items: CreateOrderInput["items"], customerEmail?: string) {
    const validation = await this.validateCart({ items } as CreateOrderInput);
    if (!validation.valid) return validation;
    if (!this.promotionService) {
      return { valid: false as const, code: "NOT_FOUND" as const, message: "El código ingresado no es válido." };
    }
    return this.promotionService.validate({
      code,
      pricingContext: this.pricingContext,
      customerEmail,
      lines: validation.items.map((item) => ({
        productId: item.productId,
        categorySlug: item.categorySlug ?? "",
        quantity: item.quantity,
        commercialUnitPrice: item.commercialUnitPrice ?? item.unitPrice,
      })),
    });
  }

  async createOrder(input: CreateOrderInput): Promise<AtomicInsertResult> {
    const existing = await this.store.findByIdempotency(
      this.tenantId,
      input.checkoutSessionId,
      input.idempotencyKey,
    );
    if (existing) {
      this.assertPricingIdentity(existing, input.couponCode);
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
    let items = validation.items;
    const commercialSubtotal = subtotal;
    let couponDiscountAmount = 0;
    let promotionId: string | undefined;
    let couponCode: string | undefined;
    let couponDiscountType: "PERCENTAGE" | "FIXED_AMOUNT" | undefined;
    let couponDiscountValue: number | undefined;
    let couponStackable: boolean | undefined;
    if (input.couponCode) {
      if (!this.promotionService) {
        throw new ServerOrderError("PROMOTION_NOT_FOUND", "El código ingresado no es válido.", { status: 422 });
      }
      const promotion = await this.promotionService.validate({
        code: input.couponCode,
        pricingContext: this.pricingContext,
        customerEmail: input.customer.email,
        lines: validation.items.map((item) => ({
          productId: item.productId,
          categorySlug: item.categorySlug ?? "",
          quantity: item.quantity,
          commercialUnitPrice: item.commercialUnitPrice ?? item.unitPrice,
        })),
      });
      if (!promotion.valid) {
        const errorCodes = {
          NOT_FOUND: "PROMOTION_NOT_FOUND",
          INACTIVE: "PROMOTION_INACTIVE",
          SCHEDULED: "PROMOTION_SCHEDULED",
          EXPIRED: "PROMOTION_EXPIRED",
          MINIMUM_NOT_MET: "PROMOTION_MINIMUM",
          EXHAUSTED: "PROMOTION_EXHAUSTED",
          ALREADY_USED: "PROMOTION_ALREADY_USED",
          NOT_APPLICABLE: "PROMOTION_NOT_APPLICABLE",
          NOT_STACKABLE: "PROMOTION_NOT_STACKABLE",
          FIRST_ORDER_ONLY: "PROMOTION_FIRST_ORDER_ONLY",
        } as const;
        throw new ServerOrderError(errorCodes[promotion.code], promotion.message, { status: 422 });
      }
      const byProduct = new Map(promotion.promotion.lines.map((line) => [line.productId, line]));
      items = validation.items.map((item) => {
        const quote = byProduct.get(item.productId)!;
        return {
          ...item,
          couponDiscountAmount: roundCurrency(quote.discountAmount / item.quantity),
          finalUnitPrice: quote.finalUnitPrice,
          unitPrice: quote.finalUnitPrice,
          lineCouponDiscount: quote.discountAmount,
          lineFinalTotal: quote.finalLineTotal,
          lineTotal: quote.finalLineTotal,
        };
      });
      promotionId = promotion.promotion.promotionId;
      couponCode = promotion.promotion.code;
      couponDiscountType = promotion.promotion.discountType;
      couponDiscountValue = promotion.promotion.discountValue;
      couponDiscountAmount = promotion.promotion.discountAmount;
      couponStackable = promotion.promotion.stackable;
    }
    const finalSubtotal = roundCurrency(commercialSubtotal - couponDiscountAmount);

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
      orderSource: input.orderSource ?? "storefront",
      channelContext: input.channelContext,
      invoiceDetails: input.invoiceDetails,
      customerNotes: input.customerNotes,
      items,
      customer: input.customer,
      deliveryMethod: input.deliveryMethod,
      deliveryAddress:
        requiresDeliveryAddress(input.deliveryMethod)
          ? input.deliveryAddress
          : undefined,
      deliveryCostMode: deliveryQuote.mode,
      baseSubtotal,
      pricingDiscountAmount,
      commercialSubtotal,
      promotionId,
      couponCode,
      couponDiscountType,
      couponDiscountValue,
      couponDiscountAmount,
      couponStackable,
      subtotal: finalSubtotal,
      deliveryCost: deliveryQuote.amount,
      total: finalSubtotal + deliveryQuote.amount,
      currency: "ARS",
      orderStatus: "pending_payment",
      paymentStatus: "pending",
      paymentMethod: input.paymentMethod ?? "mercado_pago",
    });
    if (result.reused) this.assertPricingIdentity(result.order, input.couponCode);
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
