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
}

type CartAction =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; product: Product; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "update"; productId: string; quantity: number }
  | { type: "sync-prices"; prices: Record<string, number> }
  | { type: "catalog-loading" }
  | { type: "catalog-ready"; products: Product[]; pricingContextKey?: string }
  | { type: "catalog-error" }
  | { type: "retry-catalog" }
  | { type: "clear" }
  | { type: "open" }
  | { type: "close" };

interface StoredCart {
  version: number;
  items: CartItem[];
}

interface CartContextValue {
  items: CartItem[];
  isHydrated: boolean;
  isCatalogLoading: boolean;
  hasCatalogError: boolean;
  isDrawerOpen: boolean;
  announcement: string;
  pricingContextKey: string;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  syncPrices: (updates: Array<{ productId: string; unitPrice: number }>) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  openCart: () => void;
  closeCart: () => void;
  retryCatalog: () => void;
}

const initialState: CartState = {
  items: [],
  hydrated: false,
  catalogStatus: "idle",
  catalogRequest: 0,
  pricingContextKey: "",
  drawerOpen: false,
  announcement: "",
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
        drawerOpen: true,
        announcement: `${quantity} ${quantity === 1 ? "unidad agregada" : "unidades agregadas"}: ${action.product.name}`,
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
      return {
        ...state,
        items,
        catalogStatus: "ready",
        pricingContextKey:
          action.pricingContextKey ??
          action.products[0]?.pricingContextKey ??
          state.pricingContextKey,
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
      return { ...state, items: [], announcement: "Carrito vaciado" };
    case "open":
      return { ...state, drawerOpen: true };
    case "close":
      return { ...state, drawerOpen: false };
  }
}

function readStoredCart(): CartItem[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StoredCart;
    if (parsed.version !== STORAGE_VERSION || !Array.isArray(parsed.items)) return [];
    return parsed.items.filter(
      (item) =>
        item?.product?.id &&
        item.product.slug &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    );
  } catch {
    return [];
  }
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);
  const pathname = usePathname();

  useEffect(() => {
    dispatch({ type: "hydrate", items: readStoredCart() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const storedCart: StoredCart = { version: STORAGE_VERSION, items: state.items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedCart));
  }, [state.hydrated, state.items]);

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

  const addItem = useCallback((product: Product, quantity = 1) => {
    dispatch({ type: "add", product, quantity });
    trackCommerceEvent({ name: "add_to_cart", productId: product.id, quantity });
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

  const value = useMemo<CartContextValue>(
    () => ({
      items: state.items,
      isHydrated: state.hydrated,
      isCatalogLoading: state.catalogStatus === "loading",
      hasCatalogError: state.catalogStatus === "error",
      isDrawerOpen: state.drawerOpen,
      announcement: state.announcement,
      pricingContextKey: state.pricingContextKey,
      addItem,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
      retryCatalog,
    }),
    [
      state.items,
      state.hydrated,
      state.catalogStatus,
      state.drawerOpen,
      state.announcement,
      state.pricingContextKey,
      addItem,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
      retryCatalog,
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
