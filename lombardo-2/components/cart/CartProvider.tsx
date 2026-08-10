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
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import type { CartItem, Product } from "@/types/commerce";

const STORAGE_KEY = "lombardo-cart-v1";
const STORAGE_VERSION = 1;

interface CartState {
  items: CartItem[];
  hydrated: boolean;
  drawerOpen: boolean;
  announcement: string;
}

type CartAction =
  | { type: "hydrate"; items: CartItem[] }
  | { type: "add"; product: Product; quantity: number }
  | { type: "remove"; productId: string }
  | { type: "update"; productId: string; quantity: number }
  | { type: "sync-prices"; prices: Record<string, number> }
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
  isDrawerOpen: boolean;
  announcement: string;
  addItem: (product: Product, quantity?: number) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  syncPrices: (updates: Array<{ productId: string; unitPrice: number }>) => void;
  clearCart: () => void;
  getSubtotal: () => number;
  getItemCount: () => number;
  openCart: () => void;
  closeCart: () => void;
}

const initialState: CartState = {
  items: [],
  hydrated: false,
  drawerOpen: false,
  announcement: "",
};

const clampQuantity = (quantity: number) =>
  Math.min(Math.max(Math.trunc(quantity), 1), 99);

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "hydrate":
      return { ...state, items: action.items, hydrated: true };
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

  useEffect(() => {
    dispatch({ type: "hydrate", items: readStoredCart() });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    const storedCart: StoredCart = { version: STORAGE_VERSION, items: state.items };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storedCart));
  }, [state.hydrated, state.items]);

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
      isDrawerOpen: state.drawerOpen,
      announcement: state.announcement,
      addItem,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
    }),
    [
      state.items,
      state.hydrated,
      state.drawerOpen,
      state.announcement,
      addItem,
      removeItem,
      updateQuantity,
      syncPrices,
      clearCart,
      getSubtotal,
      getItemCount,
      openCart,
      closeCart,
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
