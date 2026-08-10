import type {
  CheckoutCustomer,
  CreateOrderInput,
  DeliveryAddress,
  DeliveryMethod,
} from "../../../types/checkout.ts";
import { ServerOrderError } from "./server-order-error.ts";

const identifierPattern = /^[a-zA-Z0-9_-]{16,160}$/;
const productIdPattern = /^[a-zA-Z0-9_-]{3,160}$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const whatsappPattern = /^\+[1-9]\d{9,14}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(
  source: Record<string, unknown>,
  key: string,
  maxLength = 200,
) {
  const value = source[key];
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized || normalized.length > maxLength) return null;
  return normalized;
}

function optionalString(
  source: Record<string, unknown>,
  key: string,
  maxLength = 300,
) {
  const value = source[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (normalized.length > maxLength) return null;
  return normalized || undefined;
}

function invalidRequest(message: string): never {
  throw new ServerOrderError("INVALID_REQUEST", message, { status: 400 });
}

function parseCustomer(value: unknown): CheckoutCustomer {
  if (!isRecord(value)) invalidRequest("Revisá los datos del comprador.");

  const firstName = requiredString(value, "firstName", 100);
  const lastName = requiredString(value, "lastName", 100);
  const whatsapp = requiredString(value, "whatsapp", 20);
  const email = requiredString(value, "email", 254)?.toLocaleLowerCase("es-AR");
  const dni = optionalString(value, "dni", 9);

  if (!firstName || !lastName || !whatsapp || !email) {
    invalidRequest("Revisá los datos del comprador.");
  }
  if (!whatsappPattern.test(whatsapp)) {
    invalidRequest("Ingresá un WhatsApp válido con código de área.");
  }
  if (!emailPattern.test(email)) invalidRequest("Ingresá un email válido.");
  if (dni === null || (dni && !/^\d{7,9}$/.test(dni))) {
    invalidRequest("Revisá el DNI o dejalo vacío.");
  }

  return { firstName, lastName, whatsapp, email, dni };
}

function parseDeliveryAddress(value: unknown): DeliveryAddress {
  if (!isRecord(value)) invalidRequest("Revisá la dirección de entrega.");

  const street = requiredString(value, "street", 160);
  const number = requiredString(value, "number", 30);
  const city = requiredString(value, "city", 100);
  const province = requiredString(value, "province", 100);
  const floorApartment = optionalString(value, "floorApartment", 80);
  const postalCode = optionalString(value, "postalCode", 20);
  const references = optionalString(value, "references", 500);

  if (!street || !number || !city || !province) {
    invalidRequest("Revisá la dirección de entrega.");
  }
  if (floorApartment === null || postalCode === null || references === null) {
    invalidRequest("Revisá la dirección de entrega.");
  }

  return {
    street,
    number,
    city,
    province,
    floorApartment,
    postalCode,
    references,
  };
}

export function parseCreateOrderInput(value: unknown): CreateOrderInput {
  if (!isRecord(value)) invalidRequest("El pedido recibido no es válido.");

  const checkoutSessionId = requiredString(value, "checkoutSessionId", 160);
  const idempotencyKey = requiredString(value, "idempotencyKey", 160);
  if (
    !checkoutSessionId ||
    !idempotencyKey ||
    !identifierPattern.test(checkoutSessionId) ||
    !identifierPattern.test(idempotencyKey)
  ) {
    invalidRequest("La sesión de checkout no es válida.");
  }

  if (!Array.isArray(value.items) || !value.items.length || value.items.length > 50) {
    invalidRequest("Tu carrito está vacío o contiene demasiados productos.");
  }

  const seenProducts = new Set<string>();
  const items = value.items.map((item) => {
    if (!isRecord(item)) invalidRequest("Revisá los productos del carrito.");
    const productId = requiredString(item, "productId", 160);
    const quantity = item.quantity;
    const expectedUnitPrice = item.expectedUnitPrice;
    if (!productId || !productIdPattern.test(productId) || seenProducts.has(productId)) {
      invalidRequest("El carrito contiene productos inválidos o repetidos.");
    }
    if (!Number.isInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 99) {
      invalidRequest("La cantidad solicitada no es válida.");
    }
    if (!Number.isFinite(expectedUnitPrice) || Number(expectedUnitPrice) < 0) {
      invalidRequest("El precio esperado no es válido.");
    }
    seenProducts.add(productId);
    return {
      productId,
      quantity: Number(quantity),
      expectedUnitPrice: Number(expectedUnitPrice),
    };
  });

  const deliveryMethod = value.deliveryMethod;
  if (deliveryMethod !== "PICKUP" && deliveryMethod !== "DELIVERY") {
    invalidRequest("Elegí retiro o envío.");
  }

  return {
    checkoutSessionId,
    idempotencyKey,
    items,
    customer: parseCustomer(value.customer),
    deliveryMethod: deliveryMethod as DeliveryMethod,
    deliveryAddress:
      deliveryMethod === "DELIVERY"
        ? parseDeliveryAddress(value.deliveryAddress)
        : undefined,
  };
}
