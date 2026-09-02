"use client";

import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart/CartProvider";
import { ProductVisual } from "@/components/product/ProductVisual";
import { formatCurrency } from "@/lib/utils/format-currency";
import type { SalesProduct } from "@/lib/server/ai/types";
import type { Product } from "@/types/commerce";
import styles from "./SalesAssistant.module.css";

const STARTERS = [
  "UN VINO PARA UN ASADO",
  "QUIERO HACER UN REGALO",
  "MENOS DE $20.000",
  "VER OPORTUNIDADES",
  "ARMAME UNA SELECCIÓN",
];

const transport = new DefaultChatTransport<UIMessage>({ api: "/api/ai/chat" });

export function SalesAssistant() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chatSessionId] = useState(() => crypto.randomUUID());
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { addItem, getItemCount } = useCart();
  const { id: chatId, messages, sendMessage, status, error, clearError, stop } = useChat({
    id: chatSessionId,
    transport,
    onError: () => undefined,
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    if (!open) return;
    document.body.classList.add("assistant-open");
    const timer = window.setTimeout(() => {
      if (window.matchMedia("(min-width: 48rem)").matches) inputRef.current?.focus();
    }, 120);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.setTimeout(() => launcherRef.current?.focus(), 0);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.classList.remove("assistant-open");
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open || messages.length === 0) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    messagesEndRef.current?.scrollIntoView({
      behavior: busy || reducedMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [busy, messages, open]);

  const close = () => {
    setOpen(false);
    window.setTimeout(() => launcherRef.current?.focus(), 0);
  };
  const openChat = () => {
    setOpen(true);
    trackAiEvent(chatId, "chat_open");
  };
  const submitText = useCallback((text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    clearError();
    trackAiEvent(chatId, "chat_message", undefined, { length: value.length });
    void sendMessage({ text: value });
    setInput("");
  }, [busy, chatId, clearError, sendMessage]);

  return (
    <>
      <button
        ref={launcherRef}
        className={styles.launcher}
        type="button"
        onClick={openChat}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="sales-assistant-panel"
      >
        <span className={styles.launcherMark} aria-hidden="true">
          <span />
          <span />
        </span>
        <span className={styles.launcherCopy}>
          <small>ASISTENTE</small>
          <strong>Te ayudo a elegir</strong>
        </span>
        <span className={styles.launcherArrow} aria-hidden="true">↗</span>
      </button>
      {open ? <button className={styles.backdrop} type="button" onClick={close} aria-label="Cerrar asistente" /> : null}
      <section
        ref={panelRef}
        id="sales-assistant-panel"
        className={`${styles.panel} ${open ? styles.panelOpen : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sales-assistant-title"
        aria-hidden={!open}
      >
        <header className={styles.header}>
          <div>
            <p>LOMBARDO / ASISTENTE DE COMPRA</p>
            <h2 id="sales-assistant-title">Te ayudo a elegir.</h2>
            <span>Precios, stock y productos reales.</span>
          </div>
          <button type="button" onClick={close} aria-label="Cerrar asistente">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </header>

        <div className={styles.messages} aria-live="polite" aria-busy={busy}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <span className={styles.eyebrow}>EMPEZÁ POR UNA SITUACIÓN</span>
              <h3>¿QUÉ ESTÁS BUSCANDO?</h3>
              <p>Puedo ayudarte a elegir entre miles de productos.</p>
              <div className={styles.starters}>
                {STARTERS.map((starter, index) => (
                  <button key={starter} type="button" onClick={() => submitText(starter)}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <strong>{starter}</strong>
                    <span aria-hidden="true">→</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                chatId={chatId}
                addItem={addItem}
              />
            ))
          )}
          {busy ? <p className={styles.thinking}>ESTOY BUSCANDO PRODUCTOS REALES…</p> : null}
          {error ? (
            <div className={styles.error} role="alert">
              <p>No pude encontrarlo ahora. Probá buscarlo en el catálogo.</p>
              <Link href="/productos">VER PRODUCTOS</Link>
              <button type="button" onClick={clearError}>ENTENDIDO</button>
            </div>
          ) : null}
          <div ref={messagesEndRef} aria-hidden="true" />
        </div>

        {getItemCount() > 0 ? (
          <Link
            className={styles.cartLink}
            href="/carrito"
          >
            VER CARRITO · {getItemCount()} {getItemCount() === 1 ? "PRODUCTO" : "PRODUCTOS"}
          </Link>
        ) : null}

        <form
          className={styles.composer}
          onSubmit={(event) => {
            event.preventDefault();
            submitText(input);
          }}
        >
          <label htmlFor="lombardo-ai-message">
            <span>TU CONSULTA</span>
            <input
              ref={inputRef}
              id="lombardo-ai-message"
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 1_200))}
              placeholder="Ej.: un regalo hasta $30.000"
              autoComplete="off"
              disabled={busy}
            />
          </label>
          {busy ? (
            <button type="button" onClick={stop}>PARAR</button>
          ) : (
            <button type="submit" disabled={!input.trim()}>
              <span>ENVIAR</span>
              <span aria-hidden="true">↑</span>
            </button>
          )}
        </form>
        <p className={styles.disclaimer}>
          <span aria-hidden="true" />
          Productos y precios verificados con Runia.
        </p>
      </section>
    </>
  );
}

function ChatMessage({
  message,
  chatId,
  addItem,
}: {
  message: UIMessage;
  chatId: string;
  addItem: (product: Product, quantity?: number, options?: { openCart?: boolean }) => void;
}) {
  return (
    <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage}>
      <span>{message.role === "user" ? "VOS" : "LOMBARDO."}</span>
      {message.parts.map((part, index) => {
        if (part.type === "text") return <p key={`${message.id}-${index}`}>{part.text}</p>;
        const output = toolOutput(part);
        if (!output) return null;
        const products = productsFromOutput(output);
        if (products.length) {
          return (
            <ProductRecommendations
              key={`${message.id}-${index}`}
              products={products}
              reason={typeof output.reason === "string" ? output.reason : undefined}
              chatId={chatId}
              addItem={addItem}
            />
          );
        }
        const guides = guidesFromOutput(output);
        if (guides.length) {
          return (
            <div className={styles.guides} key={`${message.id}-${index}`}>
              {guides.map((guide) => <Link key={guide.href} href={guide.href}>{guide.title} →</Link>)}
            </div>
          );
        }
        return null;
      })}
    </article>
  );
}

function ProductRecommendations({ products, reason, chatId, addItem }: {
  products: SalesProduct[];
  reason?: string;
  chatId: string;
  addItem: (product: Product, quantity?: number, options?: { openCart?: boolean }) => void;
}) {
  const [adding, setAdding] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const shownKey = products.map((product) => product.id).join(",");

  useEffect(() => {
    for (const productId of shownKey.split(",").filter(Boolean)) {
      trackAiEvent(chatId, "recommendation", productId);
    }
  }, [chatId, shownKey]);

  const add = async (product: SalesProduct) => {
    if (adding) return;
    setAdding(product.id);
    setMessage("");
    try {
      const response = await fetch("/api/ai/cart-item", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: product.id, quantity: 1 }),
      });
      const payload = (await response.json()) as { product?: Product; quantity?: number; error?: string };
      if (!response.ok || !payload.product) throw new Error(payload.error || "Producto no disponible");
      addItem(payload.product, payload.quantity ?? 1, { openCart: true });
      trackAiEvent(chatId, "add_to_cart", product.id);
      setMessage(`${product.name} agregado al carrito.`);
    } catch {
      setMessage("No pudimos agregarlo. Puede haber cambiado su disponibilidad.");
    } finally {
      setAdding(null);
    }
  };

  return (
    <div className={styles.recommendations}>
      {reason ? <p className={styles.reason}>{reason}</p> : null}
      <div className={styles.productGrid}>
        {products.map((product) => {
          const commerceProduct = visualProduct(product);
          return (
            <article className={styles.productCard} key={product.id}>
              <Link
                href={`/productos/${product.slug}`}
                onClick={() => {
                  trackAiEvent(chatId, "product_click", product.id);
                }}
              >
                <ProductVisual product={commerceProduct} variant="list" />
              </Link>
              <div className={styles.productInfo}>
                <span>{product.brand} · {product.presentation}</span>
                <h3><Link href={`/productos/${product.slug}`}>{product.name}</Link></h3>
                <strong>{formatCurrency(product.price)}</strong>
                {product.opportunity ? <small>OPORTUNIDAD VIGENTE</small> : null}
              </div>
              <div className={styles.productActions}>
                <Link href={`/productos/${product.slug}`} onClick={() => trackAiEvent(chatId, "product_click", product.id)}>VER PRODUCTO</Link>
                <button type="button" disabled={Boolean(adding)} onClick={() => void add(product)}>
                  {adding === product.id ? "AGREGANDO…" : "AGREGAR"}
                </button>
              </div>
            </article>
          );
        })}
      </div>
      {message ? <p className={styles.addMessage} role="status">{message}</p> : null}
    </div>
  );
}

function toolOutput(part: UIMessage["parts"][number]): Record<string, unknown> | null {
  if (!part.type.startsWith("tool-")) return null;
  if (Reflect.get(part, "state") !== "output-available") return null;
  const output = Reflect.get(part, "output");
  return output && typeof output === "object" ? output as Record<string, unknown> : null;
}

function productsFromOutput(output: Record<string, unknown>) {
  const products = Array.isArray(output.products)
    ? output.products
    : output.product && typeof output.product === "object"
      ? [output.product]
      : [];
  return products.filter(isSalesProduct);
}

function guidesFromOutput(output: Record<string, unknown>) {
  if (!Array.isArray(output.guides)) return [];
  return output.guides.filter((guide): guide is { href: string; title: string } =>
    Boolean(guide && typeof guide === "object" && typeof Reflect.get(guide, "href") === "string" && typeof Reflect.get(guide, "title") === "string"),
  );
}

function isSalesProduct(value: unknown): value is SalesProduct {
  return Boolean(
    value && typeof value === "object"
      && typeof Reflect.get(value, "id") === "string"
      && typeof Reflect.get(value, "slug") === "string"
      && typeof Reflect.get(value, "name") === "string"
      && typeof Reflect.get(value, "price") === "number",
  );
}

function visualProduct(product: SalesProduct): Product {
  const priceType = product.pricingPolicy === "WHOLESALE"
    ? "wholesale"
    : product.pricingPolicy === "BUSINESS"
      ? "business"
      : "retail";
  return {
    id: product.id,
    sourceProductId: product.id,
    sku: product.sku,
    slug: product.slug,
    name: product.name,
    description: product.description ?? "",
    presentation: product.presentation,
    brand: { id: product.brand, slug: slugify(product.brand), name: product.brand },
    category: { id: product.categorySlug, slug: product.categorySlug, name: product.category },
    price: product.price,
    basePrice: product.basePrice,
    priceType,
    pricingPolicy: product.pricingPolicy,
    discountPercent: product.discountPercent,
    pricingContextKey: `ai:${product.pricingPolicy}`,
    opportunity: product.opportunity ?? undefined,
    availability: product.availability,
    stock: product.stock,
    images: product.imageUrl ? [{ id: product.id, src: product.imageUrl, alt: product.name }] : [],
    active: true,
    featured: false,
    situations: [],
    giftLevels: [],
    tags: [],
  };
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es-AR").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

type BrowserEventName = "chat_open" | "chat_message" | "recommendation" | "product_click" | "add_to_cart";

function trackAiEvent(chatId: string, eventName: BrowserEventName, productId?: string, metadata?: Record<string, string | number | boolean | null>) {
  if (!chatId || typeof window === "undefined") return;
  const detail = { event: eventName, name: eventName, productId, ...metadata };
  window.dispatchEvent(new CustomEvent("lombardo:analytics", { detail }));
  const analyticsWindow = window as Window & { dataLayer?: Array<Record<string, unknown>> };
  analyticsWindow.dataLayer?.push(detail);
  if (eventName === "chat_message") return;
  void fetch("/api/ai/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, eventName, productId, metadata }),
    keepalive: true,
  }).catch(() => undefined);
}
