"use client";

import { useEffect, useMemo, useState } from "react";

import {
  createManualOrderAction,
  updateAdminOrderAction,
} from "@/app/admin/actions";
import type {
  AdminOrderEditableLine,
  AdminOrderFormPayload,
  AdminOrderProductOption,
} from "@/lib/admin/order-management";
import {
  defaultDeliveryCity,
  deliveryCities,
  isActiveDeliveryMethod,
  requiresDeliveryAddress,
} from "@/lib/checkout/delivery-methods";
import type { CheckoutCustomer, DeliveryAddress, DeliveryMethod } from "@/types/checkout";
import { formatCurrency } from "@/lib/utils/format-currency";

import styles from "@/app/admin/admin.module.css";

type SearchState = "idle" | "loading" | "ready" | "error";

interface AdminOrderFormProps {
  mode: "create" | "edit";
  orderId?: string;
  publicId?: string;
  revision?: number;
  customer?: CheckoutCustomer;
  lines?: AdminOrderEditableLine[];
  deliveryMethod?: DeliveryMethod;
  deliveryAddress?: DeliveryAddress;
  deliveryCost?: number;
  discountAmount?: number;
  discountReason?: string;
  notes?: string;
  paymentStatus?: "pending" | "approved";
  commerceTotal?: number;
}

const emptyCustomer: CheckoutCustomer = {
  firstName: "",
  lastName: "",
  whatsapp: "",
  email: "",
};

const emptyAddress: DeliveryAddress = {
  street: "",
  number: "",
  city: "Rosario",
  province: "Santa Fe",
};

function rounded(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

export function AdminOrderForm({
  mode,
  orderId,
  publicId,
  revision = 0,
  customer: initialCustomer = emptyCustomer,
  lines: initialLines = [],
  deliveryMethod: initialDeliveryMethod = "DELIVERY_ROSARIO",
  deliveryAddress: initialDeliveryAddress = emptyAddress,
  deliveryCost: initialDeliveryCost = 0,
  discountAmount: initialDiscount = 0,
  discountReason: initialReason = "",
  notes: initialNotes = "",
  paymentStatus: initialPaymentStatus = "pending",
  commerceTotal,
}: AdminOrderFormProps) {
  const [customer, setCustomer] = useState(initialCustomer);
  const [lines, setLines] = useState(initialLines);
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>(initialDeliveryMethod);
  const [deliveryAddress, setDeliveryAddress] = useState(initialDeliveryAddress);
  const [deliveryCost, setDeliveryCost] = useState(initialDeliveryCost);
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount");
  const [discountValue, setDiscountValue] = useState(initialDiscount);
  const [discountReason, setDiscountReason] = useState(initialReason);
  const [notes, setNotes] = useState(initialNotes);
  const [paymentStatus, setPaymentStatus] = useState(initialPaymentStatus);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AdminOrderProductOption[]>([]);
  const [searchState, setSearchState] = useState<SearchState>("idle");

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setSearchState("loading");
      void fetch(`/admin/api/order-products?q=${encodeURIComponent(term)}`, {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (response) => {
          const payload = (await response.json()) as {
            products?: AdminOrderProductOption[];
            error?: string;
          };
          if (!response.ok || !payload.products) throw new Error(payload.error || "search failed");
          return payload.products;
        })
        .then((products) => {
          setResults(products);
          setSearchState("ready");
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
          setSearchState("error");
        });
    }, 180);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const itemsSubtotal = useMemo(
    () => rounded(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)),
    [lines],
  );
  const discountAmount = rounded(
    discountMode === "percent"
      ? itemsSubtotal * Math.min(Math.max(discountValue, 0), 100) / 100
      : Math.min(Math.max(discountValue, 0), itemsSubtotal),
  );
  const subtotal = rounded(itemsSubtotal - discountAmount);
  const deliveryRequired = requiresDeliveryAddress(deliveryMethod);
  const effectiveDeliveryCost = deliveryRequired ? rounded(deliveryCost) : 0;
  const total = rounded(subtotal + effectiveDeliveryCost);
  const hasPriceOverride = lines.some(
    (line) => Math.abs(line.catalogUnitPrice - line.unitPrice) >= 0.01,
  );

  const addProduct = (product: AdminOrderProductOption) => {
    setLines((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: Math.min(line.quantity + 1, 999) }
            : line,
        );
      }
      return [
        ...current,
        {
          productId: product.id,
          sku: product.sku,
          name: product.name,
          presentation: product.presentation,
          quantity: 1,
          unitPrice: product.retailPrice,
          catalogUnitPrice: product.retailPrice,
        },
      ];
    });
    setQuery("");
    setResults([]);
  };

  const payload: AdminOrderFormPayload = {
    customer,
    items: lines.map(({ productId, quantity, unitPrice }) => ({ productId, quantity, unitPrice })),
    deliveryMethod,
    deliveryAddress: deliveryRequired ? deliveryAddress : undefined,
    deliveryCost: effectiveDeliveryCost,
    discountAmount,
    discountReason: discountReason || undefined,
    notes: notes || undefined,
    paymentStatus,
  };

  return (
    <form
      action={mode === "create" ? createManualOrderAction : updateAdminOrderAction}
      className={styles.orderManagementForm}
    >
      <input name="payload" type="hidden" value={JSON.stringify(payload)} />
      {mode === "edit" ? (
        <>
          <input name="orderId" type="hidden" value={orderId} />
          <input name="publicId" type="hidden" value={publicId} />
          <input name="revision" type="hidden" value={revision} />
        </>
      ) : null}

      <section className={styles.managementCard}>
        <div className={styles.managementHeading}>
          <div><span>01</span><h2>CLIENTE</h2></div>
          <p>Los datos operativos pueden corregirse sin modificar la identidad de una cuenta registrada.</p>
        </div>
        <div className={styles.managementFields}>
          <label><span>Nombre *</span><input required maxLength={80} value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} /></label>
          <label><span>Apellido</span><input maxLength={80} value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} /></label>
          <label><span>WhatsApp</span><input inputMode="tel" maxLength={24} placeholder="+549341…" value={customer.whatsapp} onChange={(event) => setCustomer({ ...customer, whatsapp: event.target.value })} /></label>
          <label><span>Email</span><input maxLength={254} type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} /></label>
          <label><span>DNI</span><input maxLength={24} value={customer.dni ?? ""} onChange={(event) => setCustomer({ ...customer, dni: event.target.value || undefined })} /></label>
        </div>
      </section>

      <section className={styles.managementCard}>
        <div className={styles.managementHeading}>
          <div><span>02</span><h2>PRODUCTOS Y PRECIOS</h2></div>
          <p>El catálogo se resuelve desde Runia. Cantidad y precio pueden ajustarse manualmente.</p>
        </div>
        <div className={styles.orderProductSearch}>
          <label htmlFor="admin-order-product-search">PRODUCTO, MARCA O SKU</label>
          <input id="admin-order-product-search" autoComplete="off" placeholder="Ej. Rutini, Malbec, VIN001…" type="search" value={query} onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              setResults([]);
              setSearchState("idle");
            }
          }} />
          <small role="status">{searchState === "loading" ? "BUSCANDO EN RUNIA…" : searchState === "error" ? "NO PUDIMOS BUSCAR." : query.trim().length >= 2 ? `${results.length} RESULTADOS` : "ESCRIBÍ AL MENOS 2 CARACTERES"}</small>
          {results.length ? (
            <div className={styles.orderProductResults}>
              {results.map((product) => (
                <button key={product.id} type="button" onClick={() => addProduct(product)}>
                  <span><strong>{product.name}</strong><small>{product.sku} · {product.presentation}</small></span>
                  <strong>{formatCurrency(product.retailPrice)}</strong>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {lines.length ? (
          <div className={styles.managementLines}>
            <div className={styles.managementLineHeader}><span>PRODUCTO</span><span>CANT.</span><span>PRECIO UNIT.</span><span>TOTAL</span><span /></div>
            {lines.map((line) => (
              <div className={styles.managementLine} key={line.productId} data-override={Math.abs(line.catalogUnitPrice - line.unitPrice) >= 0.01}>
                <span><strong>{line.name}</strong><small>{line.sku} · Lista {formatCurrency(line.catalogUnitPrice)}</small></span>
                <input aria-label={`Cantidad de ${line.name}`} min={1} max={999} type="number" value={line.quantity} onChange={(event) => {
                  const quantity = Math.min(Math.max(Number(event.target.value) || 1, 1), 999);
                  setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, quantity } : item));
                }} />
                <input aria-label={`Precio de ${line.name}`} min={0.01} max={1_000_000_000} step={0.01} type="number" value={line.unitPrice} onChange={(event) => {
                  const unitPrice = Math.max(Number(event.target.value) || 0, 0);
                  setLines((current) => current.map((item) => item.productId === line.productId ? { ...item, unitPrice } : item));
                }} />
                <strong>{formatCurrency(rounded(line.unitPrice * line.quantity))}</strong>
                <button aria-label={`Quitar ${line.name}`} type="button" onClick={() => setLines((current) => current.filter((item) => item.productId !== line.productId))}>QUITAR</button>
              </div>
            ))}
          </div>
        ) : <p className={styles.managementEmpty}>Agregá al menos un producto.</p>}
      </section>

      <section className={styles.managementCard}>
        <div className={styles.managementHeading}>
          <div><span>03</span><h2>ENTREGA Y AJUSTES</h2></div>
          <p>Todo cambio queda registrado con operador, fecha, motivo y totales anterior/nuevo.</p>
        </div>
        <div className={styles.managementFields}>
          <label><span>Zona de entrega</span><select value={deliveryMethod} onChange={(event) => {
            const method = event.target.value as DeliveryMethod;
            setDeliveryMethod(method);
            if (isActiveDeliveryMethod(method)) {
              setDeliveryAddress((current) => ({ ...current, city: defaultDeliveryCity(method) }));
            }
          }}><option value="DELIVERY_ROSARIO">Rosario</option><option value="DELIVERY_SOUTH">Pueblo Esther, Lagos o Alvear</option>{initialDeliveryMethod === "PICKUP" ? <option value="PICKUP">Retiro (pedido existente)</option> : null}{initialDeliveryMethod === "DELIVERY" ? <option value="DELIVERY">Envío anterior (pedido existente)</option> : null}</select></label>
          {deliveryRequired ? <label><span>Costo de entrega</span><input min={0} step={0.01} type="number" value={deliveryCost} onChange={(event) => setDeliveryCost(Math.max(Number(event.target.value) || 0, 0))} /></label> : null}
          <label><span>Descuento manual</span><div className={styles.compoundField}><select aria-label="Tipo de descuento" value={discountMode} onChange={(event) => setDiscountMode(event.target.value as "amount" | "percent")}><option value="amount">$</option><option value="percent">%</option></select><input min={0} max={discountMode === "percent" ? 100 : itemsSubtotal} step={0.01} type="number" value={discountValue} onChange={(event) => setDiscountValue(Math.max(Number(event.target.value) || 0, 0))} /></div></label>
          <label className={styles.wideField}><span>Motivo del ajuste {discountAmount > 0 || hasPriceOverride ? "*" : ""}</span><input required={discountAmount > 0 || hasPriceOverride} maxLength={500} placeholder="Ej. precio acordado con el cliente" value={discountReason} onChange={(event) => setDiscountReason(event.target.value)} /></label>
          {mode === "create" ? <label><span>Estado de pago</span><select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as "pending" | "approved")}><option value="pending">Pendiente</option><option value="approved">Cobrado manualmente</option></select></label> : null}
          <label className={styles.wideField}><span>Notas internas</span><textarea maxLength={4000} rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        </div>

        {deliveryRequired ? (
          <div className={styles.managementAddress}>
            <label><span>Calle *</span><input required value={deliveryAddress.street} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, street: event.target.value })} /></label>
            <label><span>Número *</span><input required value={deliveryAddress.number} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, number: event.target.value })} /></label>
            <label><span>Piso / Depto.</span><input value={deliveryAddress.floorApartment ?? ""} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, floorApartment: event.target.value || undefined })} /></label>
            <label><span>Ciudad *</span>{isActiveDeliveryMethod(deliveryMethod) ? <select required value={deliveryAddress.city} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, city: event.target.value })}>{deliveryCities(deliveryMethod).map((city) => <option key={city} value={city}>{city}</option>)}</select> : <input required value={deliveryAddress.city} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, city: event.target.value })} />}</label>
            <label><span>Provincia *</span><input required value={deliveryAddress.province} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, province: event.target.value })} /></label>
            <label><span>Código postal</span><input value={deliveryAddress.postalCode ?? ""} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, postalCode: event.target.value || undefined })} /></label>
            <label className={styles.wideField}><span>Referencias</span><input value={deliveryAddress.references ?? ""} onChange={(event) => setDeliveryAddress({ ...deliveryAddress, references: event.target.value || undefined })} /></label>
          </div>
        ) : null}
      </section>

      <aside className={styles.managementSummary}>
        <div><span>Productos</span><strong>{formatCurrency(itemsSubtotal)}</strong></div>
        <div><span>Descuento manual</span><strong>−{formatCurrency(discountAmount)}</strong></div>
        <div><span>Entrega</span><strong>{formatCurrency(effectiveDeliveryCost)}</strong></div>
        <div className={styles.managementGrandTotal}><span>TOTAL DE GESTIÓN</span><strong>{formatCurrency(total)}</strong></div>
        {mode === "edit" && commerceTotal !== undefined && Math.abs(commerceTotal - total) >= 0.01 ? <p>El snapshot comercial original permanece en {formatCurrency(commerceTotal)}. Esta edición cambia únicamente la operación interna.</p> : null}
        <button className={styles.primaryButton} disabled={!lines.length} type="submit">{mode === "create" ? "CREAR PEDIDO MANUAL" : "GUARDAR CAMBIOS"}</button>
      </aside>
    </form>
  );
}
