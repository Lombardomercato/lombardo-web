const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_RETURN_PATHS = [
  "/mi-cuenta",
  "/checkout",
  "/carrito",
  "/productos",
  "/nueva-clave",
] as const;

export type CustomerPasswordValidation =
  | { valid: true; password: string }
  | { valid: false; message: string };

export interface CustomerLoginValues {
  email: string;
  password: string;
}

export type CustomerLoginValidation =
  | { valid: true; values: CustomerLoginValues }
  | { valid: false; message: string };

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export function normalizeCustomerEmail(value: string) {
  return value.trim().toLocaleLowerCase("en-US");
}

export function validateCustomerLogin(
  formData: FormData,
): CustomerLoginValidation {
  const email = normalizeCustomerEmail(formString(formData, "email"));
  const password = formString(formData, "password");

  if (!email || email.length > 254 || !EMAIL_PATTERN.test(email)) {
    return { valid: false, message: "Ingresá un email válido." };
  }
  if (password.length < 8 || password.length > 256) {
    return { valid: false, message: "Ingresá tu contraseña." };
  }

  return { valid: true, values: { email, password } };
}

export function sanitizeCustomerReturnPath(
  value: string | null | undefined,
  fallback = "/mi-cuenta",
) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }

  try {
    const url = new URL(value, "https://lombardo.invalid");
    if (url.origin !== "https://lombardo.invalid") return fallback;
    if (
      !ALLOWED_RETURN_PATHS.some(
        (path) => url.pathname === path || url.pathname.startsWith(`${path}/`),
      )
    ) {
      return fallback;
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function validateCustomerPassword(
  formData: FormData,
): CustomerPasswordValidation {
  const password = formString(formData, "password");
  const confirmation = formString(formData, "passwordConfirmation");

  if (password.length < 10 || password.length > 256) {
    return {
      valid: false,
      message: "La contraseña debe tener al menos 10 caracteres.",
    };
  }
  if (password !== confirmation) {
    return { valid: false, message: "Las contraseñas no coinciden." };
  }
  return { valid: true, password };
}
