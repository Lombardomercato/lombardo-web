"use client";

import { useRouter } from "next/navigation";
import {
  useActionState,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createAdminOrderAction,
  type AdminCreateOrderState,
} from "@/app/admin/actions";
import {
  defaultDeliveryCity,
  deliveryCities,
  type ActiveDeliveryMethod,
} from "@/lib/checkout/delivery-methods";
import type { AdminCustomer } from "@/lib/server/admin/types";
import type {
  QuickOrderProduct,
  QuickOrderSearchResult,
} from "@/lib/quick-order/types";
import { formatCurrency } from "@/lib/utils/format-currency";

import adminStyles from "@/app/admin/admin.module.css";
import styles from "./AdminOrderCreateForm.module.css";

interface AdminOrderCreateFormProps {
  customers: Array<Pick<
    AdminCustomer,
    "id" | "name" | "email" | "whatsapp" | "pricingPolicy" | "discountPercent"
  >>;
  checkoutSessionId: string;
  idempotencyKey: string;
}

interface SelectedItem extends QuickOrderProduct {
  quantity: number;
}

type SearchStatus = "idle" | "searching" | "ready" | "error";

const initialActionState: AdminCreateOrderState = {
  status: "idle",
  message: "",
};

function policyLabel(customer: Pick<AdminCustomer, "pricingPolicy" | "discountPercent">) {
  if (customer.pricingPolicy === "CUSTOM_DISCOUNT") {
    return `MINORISTA −${customer.discountPercent}%`;
  }
  if (customer.pricingPolicy === "WHOLESALE") return "MAYORISTA";
  if (customer.pricingPolicy === "BUSINESS") return "NEGOCIO";
  return "MINORISTA";
}

function useDebouncedValue(value: string, delay: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [delay, value]);
  return debounced;
}

function boundedQuantity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(99, Math.max(1, Math.trunc(value)));
}

export function AdminOrderCreateForm({
  customers,
  checkoutSessionId,
  idempotencyKey,
}: AdminOrderCreateFormProps) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    createAdminOrderAction,
    initialActionState,
  );
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? "guest");
  const [deliveryMethod, setDeliveryMethod] = useState<ActiveDeliveryMethod>("DELIVERY_ROSARIO");
  const [deliveryCity, setDeliveryCity] = useState(defaultDeliveryCity("DELIVERY_ROSARIO"));
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 180);
  const [results, setResults] = useState<QuickOrderProduct[]>([]);
  const [searchStatus, setSearchStatus] = useState<SearchStatus>("idle");
  const [truncated, setTruncated] = useState(false);
  const [items, setItems] = useState<SelectedItem[]>([]);
  const selectedCustomer = customers.find((customer) => customer.id === customerId);
  const isGuest = customerId === "guest";

  useEffect(() => {
    if (!state.publicId) return;
    router.push(
      `/admin/pedidos/${state.publicId}?success=${encodeURIComponent(state.message)}`,
    );
  }, [router, state.message, state.publicId]);

  useEffect(() => {
    if (!debouncedQuery) return;
    const controller = new AbortController();
    void fetch(
      `/admin/api/orders/products?customerId=${encodeURIComponent(customerId)}&q=${encodeURIComponent(debouncedQuery)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as
          | QuickOrderSearchResult
          | { error?: string };
        if (!response.ok || !("products" in payload)) {
          throw new Error("error" in payload ? payload.error : undefined);
        }
        return payload;
      })
      .then((payload) => {
        setResults(payload.products);
        setTruncated(payload.truncated);
        setSearchStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setResults([]);
        setSearchStatus("error");
      });
    return () => controller.abort();
  }, [customerId, debouncedQuery]);

  const subtotal = useMemo(
    () => items.reduce(
      (total, item) => total + item.product.price * item.quantity,
      0,
    ),
    [items],
  );

  const serializedItems = JSON.stringify(items.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    expectedUnitPrice: item.product.price,
  })));

  const changeCustomer = (nextCustomerId: string) => {
    setCustomerId(nextCustomerId);
    setQuery("");
    setResults([]);
    setTruncated(false);
    setSearchStatus("idle");
    setItems([]);
  };

  const addProduct = (entry: QuickOrderProduct) => {
    setItems((current) => {
      const existing = current.find((item) => item.product.id === entry.product.id);
      if (existing) {
        return current.map((item) => item.product.id === entry.product.id
          ? { ...item, quantity: boundedQuantity(item.quantity + 1) }
          : item);
      }
      if (current.length >= 50) return current;
      return [...current, { ...entry, quantity: 1 }];
    });
    setQuery("");
    setResults([]);
    setTruncated(false);
    setSearchStatus("idle");
  };

  return (
    <form action={formAction} className={styles.form}>
      <input name="checkoutSessionId" type="hidden" value={checkoutSessionId} />
      <input name="idempotencyKey" type="hidden" value={idempotencyKey} />
      <input name="items" type="hidden" value={serializedItems} />

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>01</span>
          <div>
            <h2>CLIENTE</h2>
            <p>Elegí una cuenta existente para usar automáticamente su lista y descuento.</p>
          </div>
        </div>
        <label className={styles.field}>
          <span>CLIENTE DEL PEDIDO</span>
          <select
            name="customerId"
            value={customerId}
            onChange={(event) => changeCustomer(event.currentTarget.value)}
          >
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>
                {customer.name} · {policyLabel(customer)}
              </option>
            ))}
            <option value="guest">CLIENTE OCASIONAL · MINORISTA</option>
          </select>
        </label>
        {selectedCustomer ? (
          <div className={styles.customerSummary}>
            <strong>{selectedCustomer.name}</strong>
            <span>{selectedCustomer.email}</span>
            <span>{selectedCustomer.whatsapp}</span>
            <b>{policyLabel(selectedCustomer)}</b>
          </div>
        ) : null}
        {isGuest ? (
          <div className={styles.guestGrid}>
            <label className={styles.field}><span>NOMBRE</span><input name="firstName" required /></label>
            <label className={styles.field}><span>APELLIDO</span><input name="lastName" required /></label>
            <label className={styles.field}><span>WHATSAPP</span><input name="whatsapp" placeholder="+5493415551234" required /></label>
            <label className={styles.field}><span>EMAIL</span><input name="email" type="email" required /></label>
          </div>
        ) : null}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>02</span>
          <div>
            <h2>PRODUCTOS</h2>
            <p>Los resultados ya muestran el precio vigente para el cliente seleccionado.</p>
          </div>
        </div>
        <label className={styles.field}>
          <span>BUSCAR POR PRODUCTO, MARCA O SKU</span>
          <input
            type="search"
            autoComplete="off"
            value={query}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setQuery(value);
              if (value.trim()) {
                setSearchStatus("searching");
              } else {
                setResults([]);
                setTruncated(false);
                setSearchStatus("idle");
              }
            }}
            placeholder="Ej. Rutini, Malbec o VIN001"
          />
        </label>
        <p className={styles.searchStatus} role="status">
          {searchStatus === "searching"
            ? "BUSCANDO EN RUNIA…"
            : searchStatus === "error"
              ? "NO PUDIMOS BUSCAR. REINTENTÁ."
              : debouncedQuery
                ? `${results.length} RESULTADOS${truncated ? " · AFINÁ LA BÚSQUEDA" : ""}`
                : "ESCRIBÍ PARA AGREGAR PRODUCTOS"}
        </p>
        {results.length ? (
          <div className={styles.results}>
            {results.map((entry) => (
              <button
                key={entry.product.id}
                type="button"
                onClick={() => addProduct(entry)}
              >
                <span><strong>{entry.product.name}</strong><small>{entry.product.sku} · {entry.product.presentation}</small></span>
                <span>
                  {entry.publicUnitPrice && entry.publicUnitPrice !== entry.product.price
                    ? <small>{formatCurrency(entry.publicUnitPrice)}</small>
                    : null}
                  <strong>{formatCurrency(entry.product.price)}</strong>
                </span>
                <b>AGREGAR +</b>
              </button>
            ))}
          </div>
        ) : null}

        {items.length ? (
          <div className={styles.items}>
            {items.map((item) => (
              <div key={item.product.id}>
                <span><strong>{item.product.name}</strong><small>{item.product.sku} · {formatCurrency(item.product.price)} c/u</small></span>
                <label>
                  <span className="sr-only">Cantidad de {item.product.name}</span>
                  <input
                    type="number"
                    min="1"
                    max="99"
                    value={item.quantity}
                    onChange={(event) => setItems((current) => current.map((currentItem) =>
                      currentItem.product.id === item.product.id
                        ? { ...currentItem, quantity: boundedQuantity(event.currentTarget.valueAsNumber) }
                        : currentItem))}
                  />
                </label>
                <strong>{formatCurrency(item.product.price * item.quantity)}</strong>
                <button
                  type="button"
                  onClick={() => setItems((current) => current.filter((currentItem) => currentItem.product.id !== item.product.id))}
                >
                  QUITAR
                </button>
              </div>
            ))}
            <div className={styles.subtotal}><span>SUBTOTAL</span><strong>{formatCurrency(subtotal)}</strong></div>
          </div>
        ) : (
          <p className={styles.empty}>Todavía no agregaste productos.</p>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeading}>
          <span>03</span>
          <div>
            <h2>ENTREGA</h2>
            <p>El pedido quedará con pago pendiente para coordinar desde Admin.</p>
          </div>
        </div>
        <label className={styles.field}>
          <span>ZONA DE ENTREGA</span>
          <select
            name="deliveryMethod"
            value={deliveryMethod}
            onChange={(event) => {
              const method = event.currentTarget.value as ActiveDeliveryMethod;
              setDeliveryMethod(method);
              setDeliveryCity(defaultDeliveryCity(method));
            }}
          >
            <option value="DELIVERY_ROSARIO">ROSARIO</option>
            <option value="DELIVERY_SOUTH">PUEBLO ESTHER, LAGOS O ALVEAR</option>
          </select>
        </label>
        <div className={styles.addressGrid}>
          <label className={styles.field}><span>CALLE</span><input name="street" required /></label>
          <label className={styles.field}><span>NÚMERO</span><input name="number" required /></label>
          <label className={styles.field}><span>PISO / DEPTO.</span><input name="floorApartment" /></label>
          <label className={styles.field}>
            <span>CIUDAD</span>
            <select name="city" value={deliveryCity} onChange={(event) => setDeliveryCity(event.currentTarget.value)}>
              {deliveryCities(deliveryMethod).map((city) => <option key={city} value={city}>{city}</option>)}
            </select>
          </label>
          <label className={styles.field}><span>PROVINCIA</span><input name="province" defaultValue="Santa Fe" required /></label>
          <label className={styles.field}><span>CÓDIGO POSTAL</span><input name="postalCode" /></label>
          <label className={`${styles.field} ${styles.wideField}`}><span>REFERENCIAS</span><input name="references" /></label>
        </div>
        <label className={styles.field}>
          <span>CUPÓN (OPCIONAL)</span>
          <input name="couponCode" maxLength={40} />
        </label>
      </section>

      {state.status === "error" ? (
        <p className={adminStyles.errorNotice} role="alert">{state.message}</p>
      ) : null}

      <div className={styles.submitBar}>
        <span>{items.length} productos · {items.reduce((total, item) => total + item.quantity, 0)} unidades</span>
        <strong>{formatCurrency(subtotal)}</strong>
        <button
          className={adminStyles.primaryButton}
          disabled={pending || !items.length || !checkoutSessionId || !idempotencyKey}
          type="submit"
        >
          {pending ? "CREANDO PEDIDO…" : "CREAR PEDIDO →"}
        </button>
      </div>
    </form>
  );
}
