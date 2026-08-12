"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type FormEvent,
  type InputHTMLAttributes,
} from "react";
import { useCart } from "@/components/cart/CartProvider";
import { trackCommerceEvent } from "@/lib/analytics/commerce-events";
import {
  emptyCheckoutForm,
  normalizeWhatsApp,
  validateCheckoutForm,
  type CheckoutErrors,
  type CheckoutFieldName,
  type CheckoutFormValues,
} from "@/lib/checkout/checkout-validation";
import { ApiOrderRepository } from "@/lib/checkout/api-order-repository";
import { OrderRepositoryError } from "@/lib/checkout/order-repository";
import {
  CHECKOUT_CONFIG,
  getDeliveryQuote,
} from "@/lib/config/checkout";
import { formatCurrency } from "@/lib/utils/format-currency";
import type {
  CreateOrderInput,
  CreateOrderResult,
  DeliveryMethod,
  OrderDraft,
} from "@/types/checkout";
import styles from "./CheckoutPage.module.css";

const SESSION_STORAGE_KEY = "lombardo-checkout-session-v1";
const SESSION_STORAGE_VERSION = 2;

interface StoredCheckoutSession {
  version: number;
  checkoutSessionId: string;
  idempotencyKey: string;
  form: CheckoutFormValues;
  order?: OrderDraft;
  orderedCartSignature?: string;
}

type CheckoutPhase = "loading" | "editing" | "submitting" | "prepared";

interface CheckoutState {
  phase: CheckoutPhase;
  form: CheckoutFormValues;
  errors: CheckoutErrors;
  repositoryError: string;
  announcement: string;
  order: OrderDraft | null;
  paymentError: CreateOrderResult["paymentError"] | null;
  retryingPayment: boolean;
  coordinatingWhatsApp: boolean;
  whatsappUrl: string;
  coordinationError: string;
}

type CheckoutAction =
  | { type: "hydrate"; form: CheckoutFormValues; order?: OrderDraft }
  | {
      type: "update-customer";
      field: keyof CheckoutFormValues["customer"];
      value: string;
    }
  | {
      type: "update-address";
      field: keyof CheckoutFormValues["deliveryAddress"];
      value: string;
    }
  | { type: "set-delivery-method"; method: DeliveryMethod }
  | { type: "validation-error"; errors: CheckoutErrors }
  | { type: "submitting" }
  | { type: "retrying-payment" }
  | { type: "coordinating-whatsapp" }
  | { type: "whatsapp-ready"; order: OrderDraft; whatsappUrl: string }
  | { type: "whatsapp-error"; message: string }
  | { type: "repository-error"; message: string }
  | { type: "payment-retry-error"; message: string }
  | {
      type: "prepared";
      order: OrderDraft;
      reused: boolean;
      paymentError?: CreateOrderResult["paymentError"];
    };

const initialState: CheckoutState = {
  phase: "loading",
  form: emptyCheckoutForm,
  errors: {},
  repositoryError: "",
  announcement: "",
  order: null,
  paymentError: null,
  retryingPayment: false,
  coordinatingWhatsApp: false,
  whatsappUrl: "",
  coordinationError: "",
};

const cloneEmptyForm = (): CheckoutFormValues => ({
  customer: { ...emptyCheckoutForm.customer },
  deliveryMethod: emptyCheckoutForm.deliveryMethod,
  deliveryAddress: { ...emptyCheckoutForm.deliveryAddress },
});

function clearFieldError(errors: CheckoutErrors, field: CheckoutFieldName) {
  if (!errors[field]) return errors;
  const nextErrors = { ...errors };
  delete nextErrors[field];
  return nextErrors;
}

function checkoutReducer(
  state: CheckoutState,
  action: CheckoutAction,
): CheckoutState {
  switch (action.type) {
    case "hydrate":
      return action.order
        ? { ...state, phase: "prepared", form: action.form, order: action.order }
        : { ...state, phase: "editing", form: action.form };
    case "update-customer":
      return {
        ...state,
        form: {
          ...state.form,
          customer: { ...state.form.customer, [action.field]: action.value },
        },
        errors: clearFieldError(
          state.errors,
          action.field as CheckoutFieldName,
        ),
        repositoryError: "",
      };
    case "update-address":
      return {
        ...state,
        form: {
          ...state.form,
          deliveryAddress: {
            ...state.form.deliveryAddress,
            [action.field]: action.value,
          },
        },
        errors: clearFieldError(
          state.errors,
          action.field as CheckoutFieldName,
        ),
        repositoryError: "",
      };
    case "set-delivery-method":
      return {
        ...state,
        form: { ...state.form, deliveryMethod: action.method },
        errors: {},
        repositoryError: "",
        announcement:
          action.method === "PICKUP"
            ? "Seleccionaste retiro en Lombardo."
            : "Seleccionaste envío en Rosario.",
      };
    case "validation-error":
      return {
        ...state,
        phase: "editing",
        errors: action.errors,
        announcement: "Revisá los campos marcados antes de confirmar.",
      };
    case "submitting":
      return {
        ...state,
        phase: "submitting",
        errors: {},
        repositoryError: "",
        announcement: "Preparando tu pedido.",
      };
    case "retrying-payment":
      return {
        ...state,
        retryingPayment: true,
        repositoryError: "",
        announcement: "Volviendo a preparar Mercado Pago.",
      };
    case "coordinating-whatsapp":
      return {
        ...state,
        coordinatingWhatsApp: true,
        coordinationError: "",
        announcement: "Preparando el mensaje para coordinar el pago.",
      };
    case "whatsapp-ready":
      return {
        ...state,
        order: action.order,
        coordinatingWhatsApp: false,
        whatsappUrl: action.whatsappUrl,
        coordinationError: "",
        announcement: "Pedido recibido. El pago quedó pendiente de coordinación.",
      };
    case "whatsapp-error":
      return {
        ...state,
        coordinatingWhatsApp: false,
        coordinationError: action.message,
        announcement: action.message,
      };
    case "repository-error":
      return {
        ...state,
        phase: "editing",
        retryingPayment: false,
        coordinatingWhatsApp: false,
        coordinationError: "",
        repositoryError: action.message,
        announcement: action.message,
      };
    case "payment-retry-error":
      return {
        ...state,
        retryingPayment: false,
        paymentError: {
          code: "PAYMENT_PREFERENCE_FAILED",
          message: action.message,
        },
        announcement: action.message,
      };
    case "prepared":
      return {
        ...state,
        phase: "prepared",
        order: action.order,
        paymentError: action.paymentError ?? null,
        retryingPayment: false,
        repositoryError: "",
        announcement: action.reused
          ? "Recuperamos el pedido ya preparado para esta sesión."
          : "Pedido preparado. El próximo paso será realizar el pago.",
      };
  }
}

const createIdentifier = (prefix: string) =>
  `${prefix}_${crypto.randomUUID().replaceAll("-", "")}`;

function createCheckoutSession(form: CheckoutFormValues): StoredCheckoutSession {
  return {
    version: SESSION_STORAGE_VERSION,
    checkoutSessionId: createIdentifier("checkout"),
    idempotencyKey: createIdentifier("idempotency"),
    form,
  };
}

function readCheckoutSession(): StoredCheckoutSession | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredCheckoutSession;
    if (
      parsed.version !== SESSION_STORAGE_VERSION ||
      !parsed.checkoutSessionId ||
      !parsed.idempotencyKey ||
      !parsed.form
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCheckoutSession(session: StoredCheckoutSession) {
  window.sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

interface CheckoutFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "name"> {
  name: CheckoutFieldName;
  label: string;
  error?: string;
  optional?: boolean;
}

function CheckoutField({
  name,
  label,
  error,
  optional = false,
  ...inputProps
}: CheckoutFieldProps) {
  const inputId = `checkout-${name}`;
  const errorId = `${inputId}-error`;

  return (
    <div className={styles.field}>
      <label htmlFor={inputId}>
        {label} {optional ? <span>OPCIONAL</span> : null}
      </label>
      <input
        {...inputProps}
        id={inputId}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
      />
      {error ? (
        <p className={styles.fieldError} id={errorId}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

function OrderPrepared({
  order,
  paymentError,
  retryingPayment,
  coordinatingWhatsApp,
  whatsappUrl,
  coordinationError,
  onRetryPayment,
  onCoordinateWhatsApp,
  onFinalizeWhatsApp,
}: {
  order: OrderDraft;
  paymentError: CreateOrderResult["paymentError"] | null;
  retryingPayment: boolean;
  coordinatingWhatsApp: boolean;
  whatsappUrl: string;
  coordinationError: string;
  onRetryPayment: () => void;
  onCoordinateWhatsApp: () => void;
  onFinalizeWhatsApp: () => void;
}) {
  const deliveryLabel =
    order.deliveryMethod === "PICKUP"
      ? "Retiro en Lombardo"
      : "Envío en Rosario";
  const deliveryPending = order.deliveryCostMode === "TO_BE_CONFIRMED";
  const whatsappSelected = order.paymentMethod === "whatsapp_coordination";

  return (
    <main className={styles.preparedPage}>
      <div className={styles.preparedKicker}>
        <span>PEDIDO / {order.orderStatus.replace("_", " ")}</span>
        <span>ARS</span>
      </div>
      <div className={styles.preparedHeading}>
        <p>{whatsappSelected ? "PEDIDO RECIBIDO." : "LISTO DE ESTE LADO."}</p>
        <h1>{whatsappSelected ? "PAGO A COORDINAR." : "PEDIDO PREPARADO."}</h1>
      </div>
      <div className={styles.preparedLayout}>
        <section aria-labelledby="prepared-next-step">
          <span className={styles.orderNumber}>
            #{order.publicId.slice(0, 8).toUpperCase()}
          </span>
          <h2 id="prepared-next-step">
            {whatsappSelected
              ? "Escribinos para coordinar cómo pagar."
              : "El próximo paso será realizar el pago."}
          </h2>
          <p>
            El pedido quedó guardado como pendiente de pago. Todavía no se realizó
            ningún cobro ni quedó confirmado.
          </p>
          {deliveryPending ? (
            <p className={styles.deliveryPending}>
              Antes de pagar confirmaremos el costo de envío.
            </p>
          ) : null}
        </section>

        <aside className={styles.preparedSummary} aria-label="Resumen del pedido">
          <p>RESUMEN</p>
          {order.items.map((item) => (
            <div className={styles.preparedItem} key={item.productId}>
              <span>
                {item.quantity} × {item.name}
              </span>
              <span>{formatCurrency(item.lineTotal)}</span>
            </div>
          ))}
          <div>
            <span>ENTREGA</span>
            <span>{deliveryLabel}</span>
          </div>
          <div>
            <span>TOTAL{deliveryPending ? " PROVISORIO" : ""}</span>
            <strong>{formatCurrency(order.total)}</strong>
          </div>
          {!whatsappSelected && order.paymentCheckoutUrl ? (
            <a href={order.paymentCheckoutUrl} aria-describedby="payment-ready-note">
              CONTINUAR AL PAGO <span aria-hidden="true">→</span>
            </a>
          ) : !whatsappSelected ? (
            <button
              type="button"
              disabled={
                retryingPayment || paymentError?.code !== "PAYMENT_PREFERENCE_FAILED"
              }
              onClick={onRetryPayment}
              aria-describedby="payment-disabled-note"
            >
              {retryingPayment ? "REINTENTANDO…" : "CONTINUAR AL PAGO"}
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
          {!whatsappSelected && order.paymentCheckoutUrl ? (
            <p id="payment-ready-note" className={styles.paymentNote}>
              Vas a continuar en Mercado Pago TEST.
            </p>
          ) : null}
          {!whatsappSelected && !order.paymentCheckoutUrl ? (
            <p id="payment-disabled-note" className={styles.paymentNote}>
              {paymentError?.message ?? "El pago todavía no está disponible."}
            </p>
          ) : null}
          {whatsappSelected && whatsappUrl ? (
            <a
              className={styles.whatsappAction}
              href={whatsappUrl}
              target="_blank"
              rel="noreferrer"
            >
              ABRIR WHATSAPP <span aria-hidden="true">→</span>
            </a>
          ) : (
            <button
              className={styles.whatsappAction}
              type="button"
              disabled={coordinatingWhatsApp}
              onClick={onCoordinateWhatsApp}
            >
              {coordinatingWhatsApp
                ? "PREPARANDO WHATSAPP…"
                : "COORDINAR PAGO POR WHATSAPP"}
              <span aria-hidden="true">→</span>
            </button>
          )}
          <p className={styles.paymentNote}>
            {whatsappSelected
              ? "El pedido fue recibido. El pago sigue pendiente hasta que lo coordinemos."
              : "También podés dejar Mercado Pago y coordinar el pago con Lombardo."}
          </p>
          {coordinationError ? (
            <p className={styles.coordinationError} role="alert">
              {coordinationError}
            </p>
          ) : null}
          {whatsappSelected ? (
            <button
              className={styles.finalizeCoordination}
              type="button"
              onClick={onFinalizeWhatsApp}
            >
              YA ENVIÉ EL MENSAJE. FINALIZAR PEDIDO
              <span aria-hidden="true">→</span>
            </button>
          ) : null}
          <Link className={styles.statusLink} href={`/pedido/${order.publicId}`}>
            VER ESTADO DEL PEDIDO →
          </Link>
        </aside>
      </div>
    </main>
  );
}

function getCartSignature(items: ReturnType<typeof useCart>["items"]) {
  return items
    .map((item) => `${item.product.id}:${item.quantity}`)
    .toSorted()
    .join("|");
}

export function CheckoutPage() {
  const { items, isHydrated, syncPrices, clearCart, getSubtotal, getItemCount } = useCart();
  const router = useRouter();
  const [state, dispatch] = useReducer(checkoutReducer, initialState);
  const repository = useMemo(() => new ApiOrderRepository(), []);
  const sessionRef = useRef<StoredCheckoutSession | null>(null);
  const submissionRef = useRef<Promise<void> | null>(null);
  const hydratedRef = useRef(false);
  const trackedCheckoutRef = useRef(false);
  const subtotal = getSubtotal();
  const itemCount = getItemCount();
  const cartSignature = getCartSignature(items);
  const deliveryQuote = getDeliveryQuote(state.form.deliveryMethod);
  const total = subtotal + deliveryQuote.amount;

  useEffect(() => {
    if (!isHydrated || hydratedRef.current) return;
    hydratedRef.current = true;
    let cancelled = false;

    const hydrateCheckout = async () => {
      const stored = readCheckoutSession();

      if (
        stored?.order &&
        stored.orderedCartSignature === cartSignature
      ) {
        try {
          const publicStatus = await repository.getOrderByPublicId(
            stored.order.publicId,
          );
          const order: OrderDraft = publicStatus
            ? {
                ...stored.order,
                orderStatus: publicStatus.orderStatus,
                paymentStatus: publicStatus.paymentStatus,
                paymentMethod: publicStatus.paymentMethod,
                paymentCheckoutUrl: publicStatus.paymentCheckoutUrl,
                updatedAt: publicStatus.updatedAt,
              }
            : stored.order;
          if (!cancelled) {
            sessionRef.current = { ...stored, order };
            dispatch({ type: "hydrate", form: stored.form, order });
            return;
          }
        } catch {
          if (!cancelled) {
            sessionRef.current = stored;
            dispatch({ type: "hydrate", form: stored.form, order: stored.order });
            return;
          }
        }
      }

      const session =
        stored && !stored.order
          ? stored
          : createCheckoutSession(cloneEmptyForm());
      sessionRef.current = session;
      writeCheckoutSession(session);
      if (!cancelled) dispatch({ type: "hydrate", form: session.form });
    };

    void hydrateCheckout();
    return () => {
      cancelled = true;
    };
  }, [cartSignature, isHydrated, repository]);

  useEffect(() => {
    if (
      !isHydrated ||
      !items.length ||
      trackedCheckoutRef.current ||
      state.phase === "loading"
    ) {
      return;
    }
    trackedCheckoutRef.current = true;
    trackCommerceEvent({ name: "begin_checkout", itemCount, subtotal });
  }, [isHydrated, itemCount, items.length, state.phase, subtotal]);

  const persistForm = (form: CheckoutFormValues) => {
    const session = sessionRef.current ?? createCheckoutSession(form);
    const nextSession = { ...session, form };
    sessionRef.current = nextSession;
    writeCheckoutSession(nextSession);
  };

  const updateCustomer = (
    field: keyof CheckoutFormValues["customer"],
    value: string,
  ) => {
    const form = {
      ...state.form,
      customer: { ...state.form.customer, [field]: value },
    };
    dispatch({ type: "update-customer", field, value });
    persistForm(form);
  };

  const updateAddress = (
    field: keyof CheckoutFormValues["deliveryAddress"],
    value: string,
  ) => {
    const form = {
      ...state.form,
      deliveryAddress: { ...state.form.deliveryAddress, [field]: value },
    };
    dispatch({ type: "update-address", field, value });
    persistForm(form);
  };

  const setDeliveryMethod = (method: DeliveryMethod) => {
    const form = { ...state.form, deliveryMethod: method };
    dispatch({ type: "set-delivery-method", method });
    persistForm(form);
    trackCommerceEvent({ name: "add_shipping_info", method });
  };

  const normalizeWhatsAppField = () => {
    const normalized = normalizeWhatsApp(state.form.customer.whatsapp);
    if (normalized) updateCustomer("whatsapp", normalized);
  };

  const focusFirstError = (errors: CheckoutErrors) => {
    const firstField = Object.keys(errors)[0] as CheckoutFieldName | undefined;
    if (!firstField) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`checkout-${firstField}`)?.focus();
    });
  };

  const buildCreateOrderInput = (
    form: CheckoutFormValues,
    session: StoredCheckoutSession,
  ): CreateOrderInput => ({
    checkoutSessionId: session.checkoutSessionId,
    idempotencyKey: session.idempotencyKey,
    items: items.map(({ product, quantity }) => ({
      productId: product.id,
      quantity,
      expectedUnitPrice: product.price,
    })),
    customer: form.customer,
    deliveryMethod: form.deliveryMethod,
    deliveryAddress:
      form.deliveryMethod === "DELIVERY" ? form.deliveryAddress : undefined,
  });

  const submitOrder = async (
    input: CreateOrderInput,
    session: StoredCheckoutSession,
    form: CheckoutFormValues,
    retryingPayment = false,
  ) => {
    if (submissionRef.current) return;
    const submission = (async () => {
      dispatch({ type: retryingPayment ? "retrying-payment" : "submitting" });
      try {
        const result = await repository.createOrder(input);
        const completedSession: StoredCheckoutSession = {
          ...session,
          form,
          order: result.order,
          orderedCartSignature: cartSignature,
        };
        sessionRef.current = completedSession;
        writeCheckoutSession(completedSession);
        dispatch({
          type: "prepared",
          order: result.order,
          reused: result.reused,
          paymentError: result.paymentError,
        });
        const prefersReducedMotion = window.matchMedia(
          "(prefers-reduced-motion: reduce)",
        ).matches;
        window.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? "auto" : "smooth",
        });
      } catch (error) {
        if (
          error instanceof OrderRepositoryError &&
          error.code === "PRICE_CHANGED" &&
          error.priceChanges
        ) {
          syncPrices(
            error.priceChanges.map((change) => ({
              productId: change.productId,
              unitPrice: change.currentUnitPrice,
            })),
          );
        }
        const message =
          error instanceof OrderRepositoryError
            ? error.message
            : "No pudimos preparar el pedido. Probá nuevamente en unos minutos.";
        dispatch({
          type: retryingPayment ? "payment-retry-error" : "repository-error",
          message,
        });
      }
    })();

    submissionRef.current = submission;
    try {
      await submission;
    } finally {
      submissionRef.current = null;
    }
  };

  const confirmOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validation = validateCheckoutForm(state.form);
    if (Object.keys(validation.errors).length) {
      dispatch({ type: "validation-error", errors: validation.errors });
      focusFirstError(validation.errors);
      return;
    }

    const session =
      sessionRef.current ?? createCheckoutSession(validation.normalized);
    sessionRef.current = session;
    await submitOrder(
      buildCreateOrderInput(validation.normalized, session),
      session,
      validation.normalized,
    );
  };

  const retryPayment = () => {
    const session = sessionRef.current;
    if (!session) return;
    void submitOrder(
      buildCreateOrderInput(state.form, session),
      session,
      state.form,
      true,
    );
  };

  const coordinateWhatsApp = async () => {
    if (!state.order || state.coordinatingWhatsApp) return;
    dispatch({ type: "coordinating-whatsapp" });
    try {
      const result = await repository.coordinatePaymentByWhatsApp(
        state.order.publicId,
      );
      const session = sessionRef.current;
      if (session) {
        const completedSession = { ...session, order: result.order };
        sessionRef.current = completedSession;
        writeCheckoutSession(completedSession);
      }
      dispatch({
        type: "whatsapp-ready",
        order: result.order,
        whatsappUrl: result.whatsappUrl,
      });
      window.location.assign(result.whatsappUrl);
    } catch (error) {
      dispatch({
        type: "whatsapp-error",
        message:
          error instanceof OrderRepositoryError
            ? error.message
            : "No pudimos preparar WhatsApp. Probá nuevamente en unos minutos.",
      });
    }
  };

  const finalizeWhatsAppOrder = () => {
    if (!state.order || state.order.paymentMethod !== "whatsapp_coordination") {
      return;
    }
    clearCart();
    window.sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionRef.current = null;
    router.push(`/pedido/${state.order.publicId}`);
  };

  if (!isHydrated || state.phase === "loading") {
    return (
      <main className={styles.loadingPage}>
        <p role="status">PREPARANDO CHECKOUT…</p>
      </main>
    );
  }

  if (state.phase === "prepared" && state.order) {
    return (
      <OrderPrepared
        order={state.order}
        paymentError={state.paymentError}
        retryingPayment={state.retryingPayment}
        coordinatingWhatsApp={state.coordinatingWhatsApp}
        whatsappUrl={state.whatsappUrl}
        coordinationError={state.coordinationError}
        onRetryPayment={retryPayment}
        onCoordinateWhatsApp={() => void coordinateWhatsApp()}
        onFinalizeWhatsApp={finalizeWhatsAppOrder}
      />
    );
  }

  if (!items.length) {
    return (
      <main className={styles.emptyPage}>
        <span aria-hidden="true">00</span>
        <h1>NECESITAMOS ALGO EN EL CARRITO.</h1>
        <p>Elegí un producto y después volvemos a preparar el pedido.</p>
        <Link href="/productos">IR AL CATÁLOGO →</Link>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <header className={styles.hero}>
        <div>
          <Link href="/carrito">← VOLVER AL CARRITO</Link>
          <span>CHECKOUT / 03</span>
        </div>
        <p>TODO CLARO.</p>
        <h1>PREPARAMOS TU PEDIDO.</h1>
      </header>

      <form className={styles.checkoutForm} onSubmit={confirmOrder} noValidate>
        <div className={styles.formColumn}>
          {state.repositoryError ? (
            <div className={styles.repositoryError} role="alert">
              <span>NO PUDIMOS CONTINUAR</span>
              <p>{state.repositoryError}</p>
            </div>
          ) : null}

          <section className={styles.formSection} aria-labelledby="customer-title">
            <div className={styles.sectionHeading}>
              <span>01</span>
              <div>
                <p>TUS DATOS</p>
                <h2 id="customer-title">¿A nombre de quién?</h2>
              </div>
            </div>
            <div className={styles.fieldsGrid}>
              <CheckoutField
                name="firstName"
                label="Nombre"
                value={state.form.customer.firstName}
                onChange={(event) => updateCustomer("firstName", event.target.value)}
                error={state.errors.firstName}
                autoComplete="given-name"
              />
              <CheckoutField
                name="lastName"
                label="Apellido"
                value={state.form.customer.lastName}
                onChange={(event) => updateCustomer("lastName", event.target.value)}
                error={state.errors.lastName}
                autoComplete="family-name"
              />
              <CheckoutField
                name="whatsapp"
                label="WhatsApp"
                type="tel"
                inputMode="tel"
                value={state.form.customer.whatsapp}
                onChange={(event) => updateCustomer("whatsapp", event.target.value)}
                onBlur={normalizeWhatsAppField}
                error={state.errors.whatsapp}
                autoComplete="tel"
                placeholder="341 555 0000"
              />
              <CheckoutField
                name="email"
                label="Email"
                type="email"
                inputMode="email"
                value={state.form.customer.email}
                onChange={(event) => updateCustomer("email", event.target.value)}
                error={state.errors.email}
                autoComplete="email"
              />
              <CheckoutField
                name="dni"
                label="DNI"
                optional
                inputMode="numeric"
                value={state.form.customer.dni ?? ""}
                onChange={(event) => updateCustomer("dni", event.target.value)}
                error={state.errors.dni}
                autoComplete="off"
              />
            </div>
          </section>

          <section className={styles.formSection} aria-labelledby="delivery-title">
            <div className={styles.sectionHeading}>
              <span>02</span>
              <div>
                <p>CÓMO LO RECIBÍS</p>
                <h2 id="delivery-title">Elegí lo más cómodo.</h2>
              </div>
            </div>

            <fieldset className={styles.deliveryMethods}>
              <legend className="sr-only">Método de entrega</legend>
              <label>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="PICKUP"
                  checked={state.form.deliveryMethod === "PICKUP"}
                  onChange={() => setDeliveryMethod("PICKUP")}
                />
                <span>RETIRO</span>
                <strong>Retiro en Lombardo</strong>
              </label>
              <label>
                <input
                  type="radio"
                  name="deliveryMethod"
                  value="DELIVERY"
                  checked={state.form.deliveryMethod === "DELIVERY"}
                  onChange={() => setDeliveryMethod("DELIVERY")}
                />
                <span>ENVÍO</span>
                <strong>En Rosario</strong>
              </label>
            </fieldset>

            {state.form.deliveryMethod === "PICKUP" ? (
              <div className={styles.pickupDetails} aria-live="polite">
                <div>
                  <span>DIRECCIÓN</span>
                  <strong>{CHECKOUT_CONFIG.pickup.address}</strong>
                </div>
                <div>
                  <span>HORARIO</span>
                  <strong>{CHECKOUT_CONFIG.pickup.hours}</strong>
                </div>
                <p>{CHECKOUT_CONFIG.pickup.notice}</p>
              </div>
            ) : (
              <div className={styles.addressFields} aria-live="polite">
                <CheckoutField
                  name="street"
                  label="Calle"
                  value={state.form.deliveryAddress.street}
                  onChange={(event) => updateAddress("street", event.target.value)}
                  error={state.errors.street}
                  autoComplete="address-line1"
                />
                <CheckoutField
                  name="number"
                  label="Número"
                  inputMode="numeric"
                  value={state.form.deliveryAddress.number}
                  onChange={(event) => updateAddress("number", event.target.value)}
                  error={state.errors.number}
                  autoComplete="off"
                />
                <CheckoutField
                  name="floorApartment"
                  label="Piso / depto"
                  optional
                  value={state.form.deliveryAddress.floorApartment ?? ""}
                  onChange={(event) =>
                    updateAddress("floorApartment", event.target.value)
                  }
                  autoComplete="address-line2"
                />
                <CheckoutField
                  name="city"
                  label="Ciudad"
                  value={state.form.deliveryAddress.city}
                  onChange={(event) => updateAddress("city", event.target.value)}
                  error={state.errors.city}
                  autoComplete="address-level2"
                />
                <CheckoutField
                  name="province"
                  label="Provincia"
                  value={state.form.deliveryAddress.province}
                  onChange={(event) => updateAddress("province", event.target.value)}
                  error={state.errors.province}
                  autoComplete="address-level1"
                />
                <CheckoutField
                  name="postalCode"
                  label="Código postal"
                  optional
                  value={state.form.deliveryAddress.postalCode ?? ""}
                  onChange={(event) => updateAddress("postalCode", event.target.value)}
                  autoComplete="postal-code"
                />
                <CheckoutField
                  name="references"
                  label="Referencias"
                  optional
                  value={state.form.deliveryAddress.references ?? ""}
                  onChange={(event) => updateAddress("references", event.target.value)}
                  autoComplete="off"
                />
              </div>
            )}
          </section>
        </div>

        <aside className={styles.summary} aria-labelledby="checkout-summary-title">
          <div className={styles.summaryHeading}>
            <span>03</span>
            <h2 id="checkout-summary-title">RESUMEN</h2>
          </div>
          <div className={styles.summaryItems}>
            {items.map(({ product, quantity }) => (
              <div key={product.id}>
                <span>
                  {quantity} × {product.name}
                </span>
                <strong>{formatCurrency(product.price * quantity)}</strong>
              </div>
            ))}
          </div>
          <dl className={styles.totals} aria-live="polite">
            <div>
              <dt>SUBTOTAL</dt>
              <dd>{formatCurrency(subtotal)}</dd>
            </div>
            <div>
              <dt>ENTREGA</dt>
              <dd>
                {deliveryQuote.mode === "TO_BE_CONFIRMED"
                  ? deliveryQuote.label
                  : formatCurrency(deliveryQuote.amount)}
              </dd>
            </div>
            <div>
              <dt>
                TOTAL
                {deliveryQuote.mode === "TO_BE_CONFIRMED" ? " PROVISORIO" : ""}
              </dt>
              <dd>{formatCurrency(total)}</dd>
            </div>
          </dl>
          {deliveryQuote.mode === "TO_BE_CONFIRMED" ? (
            <p className={styles.provisionalNote}>
              Confirmaremos el costo de envío antes del pago.
            </p>
          ) : null}
          <button
            className={styles.confirmButton}
            type="submit"
            disabled={state.phase === "submitting"}
          >
            <span>
              {state.phase === "submitting"
                ? "PREPARANDO PEDIDO…"
                : "CONFIRMAR PEDIDO"}
            </span>
            <span aria-hidden="true">→</span>
          </button>
          <p className={styles.noPaymentNote}>
            En este paso no se realiza ningún cobro.
          </p>
        </aside>
      </form>

      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {state.announcement}
      </p>
    </main>
  );
}
