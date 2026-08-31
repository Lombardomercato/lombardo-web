"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import type { AppliedPromotion, PromotionValidationResult } from "@/lib/promotions/types";
import type { CartItem, Product } from "@/types/commerce";

const STORAGE_KEY = "lombardo-cart-v1";
const STORAGE_VERSION = 1;

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  catalogStatus: "idle" | "loading" | "ready" | "error";
  catalogRequest: number;
  pricingContextKey: string;
  drawerOpen: boolean;
  announcement: string;
  appliedPromotion: AppliedPromotion | null;
  promotionStatus: "idle" | "loading" | "applied" | "error";
  promotionMessage: string;
}

type CartAction =
  | { type: "hydrate"; items: CartItem[]; appliedPromotion?: AppliedPromotion }
  | { type: "add"; product: Product; quantity: number; openCart?: boolean }
  | { type: "add-many"; items: CartItem[]; openCart?: boolean }
  | { type: "remove"; productId: string }
  | { type: "update"; productId: string; quantity: number }
  | { type: "sync-prices"; prices: Record<string, number> }
  | { type: "catalog-loading" }
  | { type: "catalog-ready"; products: Product[]; pricingContextKey?: string }
  | { type: "catalog-error" }
  | { type: "retry-catalog" }
  | { type: "clear" }
  | { type: "open" }
  | { type: "close" }
  | { type: "promotion-loading" }
  | { type: "promotion-applied"; promotion: AppliedPromotion; message: string }
  | { type: "promotion-error"; message: string }
  | { type: "promotion-clear" };

interface StoredCart {
  version: number;
  items: CartItem[];
  appliedPromotion?: AppliedPromotion;
}

interface CartContextValue {
  items: CartItem[];
  isHydrated: boolean;
  isCatalogLoading: boolean;
  hasCatalogError: boolean;
  isDrawerOpen: boolean;
  announcement: string;
  pricingContextKey: string;
  appliedPromotion: AppliedPromotion | null;
  promotionStatus: CartState["promotionStatus"];
  promotionMessage: string;
  addItem: (
    product: Product,
    quantity?: number,
    options?: { openCart?: boolean },
  ) => void;
  addItems: (
    items: CartItem[],
    options?: { openCart?: boolean },
  ) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  syncPrices: (updates: Array<{ productId: string; unitPrice: number }>) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  openCart: () => void;
  closeCart: () => void;
  retryCatalog: () => void;
  applyCoupon: (code: string) => Promise<void>;
  removeCoupon: () => void;
  getFinalSubtotal: () => number;
}

const initialState: CartState = {
  items: [],
  hydrated: false,
  catalogStatus: "idle",
  catalogRequest: 0,
  pricingContextKey: "",
  drawerOpen: false,
  announcement: "",
  appliedPromotion: null,
  promotionStatus: "idle",
  promotionMessage: "",
};

const clampQuantity = (quantity: number) =>
  Math.min(Math.max(Math.trunc(quantity), 1), 99);

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return {
        ...state,
        items: action.items,
        hydrated: true,
        appliedPromotion: action.appliedPromotion ?? null,
        promotionStatus: action.appliedPromotion ? "applied" : "idle",
        pricingContextKey:
          action.items[0]?.product.pricingContextKey ?? state.pricingContextKey,
      };
    case "add": {
      const quantity = clampQuantity(action.quantity);
      const existing = state.items.find(
        (item) => item.product.id === action.product.id,
      );
      const items = existing
        ? state.items.map((item) =>
            item.product.id === action.product.id
              ? { ...item, quantity: clampQuantity(item.quantity + quantity) }
              : item,
          )
        : [...state.items, { product: action.product, quantity }];

      return {
        ...state,
        items,
        pricingContextKey:
          action.product.pricingContextKey ?? state.pricingContextKey,
        drawerOpen: action.openCart ?? true,
        announcement: `${quantity} ${quantity === 1 ? "unidad agregada" : "unidades agregadas"}: ${action.product.name}`,
        appliedPromotion: null,
        promotionStatus: "idle",
        promotionMessage: "",
      };
    }
    case "add-many": {
      const itemsByProduct = new Map(
        state.items.map((item) => [item.product.id, item]),
      );
      for (const item of action.items) {
        const quantity = clampQuantity(item.quantity);
        const existing = itemsByProduct.get(item.product.id);
        itemsByProduct.set(item.product.id, {
          product: item.product,
          quantity: clampQuantity((existing?.quantity ?? 0) + quantity),
        });
      }
      const addedQuantity = action.items.reduce(
        (total, item) => total + clampQuantity(item.quantity),
        0,
      );
      return {
        ...state,
        items: Array.from(itemsByProduct.values()),
        pricingContextKey:
          action.items[0]?.product.pricingContextKey ?? state.pricingContextKey,
        drawerOpen: action.openCart ?? true,
        announcement: `${addedQuantity} ${addedQuantity === 1 ? "unidad agregada" : "unidades agregadas"} al carrito`,
        appliedPromotion: null,
        promotionStatus: "idle",
        promotionMessage: "",
      };
    }
    case "remove": {
      const removed = state.items.find(
        (item) => item.product.id === action.productId,
      );
      return {
        ...state,
        items: state.items.filter((item) => item.product.id !== action.productId),
        announcement: removed ? `${removed.product.name} eliminado del carrito` : "",
        appliedPromotion: null,
        promotionStatus: "idle",
        promotionMessage: "",
      };
    }
    case "update": {
      const quantity = clampQuantity(action.quantity);
      const updated = state.items.find(
        (item) => item.product.id === action.productId,
      );
      return {
        ...state,
        items: state.items.map((item) =>
          item.product.id === action.productId ? { ...item, quantity } : item,
        ),
        announcement: updated
          ? `${updated.product.name}: ${quantity} ${quantity === 1 ? "unidad" : "unidades"}`
          : "",
        appliedPromotion: null,
        promotionStatus: "idle",
        promotionMessage: "",
      };
    }
    case "sync-prices":
      return {
        ...state,
        items: state.items.map((item) => {
          const price = action.prices[item.product.id];
          return price === undefined
            ? item
            : { ...item, product: { ...item.product, price } };
        }),
        announcement: "Actualizamos los precios del carrito.",
        appliedPromotion: null,
        promotionStatus: "idle",
        promotionMessage: "",
      };
    case "catalog-loading":
      return { ...state, catalogStatus: "loading" };
    case "catalog-ready": {
      const products = new Map(
        action.products.map((product) => [product.id, product]),
      );
      const items = state.items.flatMap((item) => {
        const product = products.get(item.product.id);
        return product ? [{ ...item, product }] : [];
      });
      const removed = state.items.length - items.length;
      const nextPricingContextKey =
        action.pricingContextKey ??
        action.products[0]?.pricingContextKey ??
        state.pricingContextKey;
      const pricingChanged = Boolean(
        state.pricingContextKey && nextPricingContextKey !== state.pricingContextKey,
      ) || items.some((item) => {
        const previous = state.items.find((current) => current.product.id === item.product.id);
        return previous?.product.price !== item.product.price;
      });
      return {
        ...state,
        items,
        catalogStatus: "ready",
        pricingContextKey: nextPricingContextKey,
        appliedPromotion: pricingChanged || removed ? null : state.appliedPromotion,
        promotionStatus: pricingChanged || removed ? "idle" : state.promotionStatus,
        promotionMessage: pricingChanged || removed ? "" : state.promotionMessage,
        announcement: removed
          ? "Quitamos del carrito productos que ya no están disponibles."
          : state.announcement,
      };
    }
    case "catalog-error":
      return { ...state, catalogStatus: "error" };
    case "retry-catalog":
      return {
        ...state,
        catalogStatus: "idle",
        catalogRequest: state.catalogRequest + 1,
      };
    case "clear":
      return { ...state, items: [], appliedPromotion: null, promotionStatus: "idle", promotionMessage: "", announcement: "Carrito vaciado" };
    case "open":
      return { ...state, drawerOpen: true };
    case "close":
      return { ...state, drawerOpen: false };
    case "promotion-loading":
      return { ...state, promotionStatus: "loading", promotionMessage: "Validando cupón…" };
    case "promotion-applied":
      return { ...state, appliedPromotion: action.promotion, promotionStatus: "applied", promotionMessage: action.message };
    case "promotion-error":
      return { ...state, appliedPromotion: null, promotionStatus: "error", promotionMessage: action.message };
    case "promotion-clear":
      return { ...state, appliedPromotion: null, promotionStatus: "idle", promotionMessage: "" };
  }
}

function readStoredCart(): StoredCart {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: STORAGE_VERSION, items: [] };
    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return { version: STORAGE_VERSION, items: [] };
    const items = parsed.items.filter(
      (item) =>
        item?.product?.id &&
        item.product.slug &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    );
    return { version: STORAGE_VERSION, items, appliedPromotion: parsed.appliedPromotion };
  } catch {
    return { version: STORAGE_VERSION, items: [] };
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const pathname = usePathname();

  useEffect(() => {
    const stored = readStoredCart();
    dispatch({ type: "hydrate", items: stored.items, appliedPromotion: stored.appliedPromotion });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const storedCart: StoredCart = { version: STORAGE_VERSION, items: state.items, appliedPromotion: state.appliedPromotion ?? undefined };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedCart));
  }, [state.hydrated, state.items, state.appliedPromotion]);

  const productIds = useMemo(
    () => state.items.map((item) => item.product.id).sort().join(","),
    [state.items],
  );

  useEffect(() => {
    if (!state.hydrated) return;
    if (!productIds) {
      dispatch({ type: "catalog-ready", products: [] });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: "catalog-loading" });
    void fetch(`/api/catalog?ids=${encodeURIComponent(productIds)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("catalog unavailable");
        return (await response.json()) as { products: Product[] };
      })
      .then(({ products }) =>
        dispatch({
          type: "catalog-ready",
          products,
          pricingContextKey: products[0]?.pricingContextKey,
        }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        dispatch({ type: "catalog-error" });
      });

    return () => controller.abort();
  }, [pathname, productIds, state.catalogRequest, state.hydrated]);

  const addItem = useCallback((
    product: Product,
    quantity = 1,
    options?: { openCart?: boolean },
  ) => {
    dispatch({ type: "add", product, quantity, openCart: options?.openCart });
    trackCommerceEvent({ name: "add_to_cart", productId: product.id, quantity });
  }, []);

  const addItems = useCallback((
    items: CartItem[],
    options?: { openCart?: boolean },
  ) => {
    if (!items.length) return;
    dispatch({ type: "add-many", items, openCart: options?.openCart });
    for (const { product, quantity } of items) {
      trackCommerceEvent({ name: "add_to_cart", productId: product.id, quantity });
    }
  }, []);

  const removeItem = useCallback(
    (productId: string) => {
      const removed = state.items.find((item) => item.product.id === productId);
      dispatch({ type: "remove", productId });
      if (removed) {
        trackCommerceEvent({
          name: "remove_from_cart",
          productId,
          quantity: removed.quantity,
        });
      }
    },
    [state.items],
  );

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      dispatch({ type: "remove", productId });
      return;
    }
    dispatch({ type: "update", productId, quantity });
  }, []);

  const syncPrices = useCallback(
    (updates: Array<{ productId: string; unitPrice: number }>) => {
      dispatch({
        type: "sync-prices",
        prices: Object.fromEntries(
          updates.map((update) => [update.productId, update.unitPrice]),
        ),
      });
    },
    [],
  );

  const clearCart = useCallback(() => dispatch({ type: "clear" }), []);
  const openCart = useCallback(() => dispatch({ type: "open" }), []);
  const closeCart = useCallback(() => dispatch({ type: "close" }), []);
  const retryCatalog = useCallback(
    () => dispatch({ type: "retry-catalog" }),
    [],
  );
  const getSubtotal = useCallback(
    () =>
      state.items.reduce(
        (subtotal, item) => subtotal + item.product.price * item.quantity,
        0,
      ),
    [state.items],
  );
  const getItemCount = useCallback(
    () => state.items.reduce((count, item) => count + item.quantity, 0),
    [state.items],
  );
  const applyCoupon = useCallback(async (code: string) => {
    dispatch({ type: "promotion-loading" });
    try {
      const response = await fetch("/api/promotions/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          items: state.items.map(({ product, quantity }) => ({
            productId: product.id,
            quantity,
            expectedUnitPrice: product.price,
          })),
        }),
      });
      const result = (await response.json()) as PromotionValidationResult;
      if (!response.ok || !result.valid) {
        dispatch({ type: "promotion-error", message: result.message });
        return;
      }
      dispatch({ type: "promotion-applied", promotion: result.promotion, message: result.message });
    } catch {
      dispatch({ type: "promotion-error", message: "No pudimos validar el cupón en este momento." });
    }
  }, [state.items]);
  const removeCoupon = useCallback(() => dispatch({ type: "promotion-clear" }), []);
  const getFinalSubtotal = useCallback(
    () => Math.max(0, getSubtotal() - (state.appliedPromotion?.discountAmount ?? 0)),
    [getSubtotal, state.appliedPromotion],
  );

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      isHydrated: state.hydrated,
      isCatalogLoading: state.catalogStatus === "loading",
      hasCatalogError: state.catalogStatus === "error",
      isDrawerOpen: state.drawerOpen,
      announcement: state.announcement,
      pricingContextKey: state.pricingContextKey,
      appliedPromotion: state.appliedPromotion,
      promotionStatus: state.promotionStatus,
      promotionMessage: state.promotionMessage,
      addItem,
      addItems,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
      retryCatalog,
      applyCoupon,
      removeCoupon,
      getFinalSubtotal,
    }),
    [
      state.items,
      state.hydrated,
      state.catalogStatus,
      state.drawerOpen,
      state.announcement,
      state.pricingContextKey,
      state.appliedPromotion,
      state.promotionStatus,
      state.promotionMessage,
      addItem,
      addItems,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
      retryCatalog,
      applyCoupon,
      removeCoupon,
      getFinalSubtotal,
    ],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {state.announcement}
      </p>
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used within CartProvider");
  return context;
}
