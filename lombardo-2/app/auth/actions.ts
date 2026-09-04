"use server";

import { createHash } from "node:crypto";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  getCurrentCustomerAccount,
  getClaimsSubjectForClient,
} from "@/lib/server/customers/customer-auth";
import {
  normalizeCustomerEmail,
  sanitizeCustomerReturnPath,
  validateCustomerLogin,
  validateCustomerPassword,
  validateCustomerRegistration,
} from "@/lib/server/customers/validation";
import { provisionRetailCustomerAccount } from "@/lib/server/customers/customer-registration";
import { AdminStoreError } from "@/lib/server/admin/runia-admin-store";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CustomerLoginActionState {
  status: "idle" | "error";
  message: string;
}

export interface CustomerAccessActionState {
  status: "idle" | "error" | "success";
  message: string;
}

export type CustomerRegistrationActionState = CustomerAccessActionState;

const INVALID_LOGIN_MESSAGE =
  "No pudimos iniciar sesión. Revisá tus datos o el estado de tu cuenta.";

function rateLimitIdentity(value: string) {
  return createHash("sha256").update(value).digest("base64url");
}

async function requestIp() {
  const requestHeaders = await headers();
  return (
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    requestHeaders.get("x-real-ip") ||
    "unknown"
  );
}

function configuredAppOrigin() {
  const raw = process.env.APP_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function loginCustomer(
  _previousState: CustomerLoginActionState,
  formData: FormData,
): Promise<CustomerLoginActionState> {
  const validation = validateCustomerLogin(formData);
  if (!validation.valid) {
    return { status: "error", message: validation.message };
  }

  const ip = await requestIp();
  const identity = rateLimitIdentity(`${ip}:${validation.values.email}`);
  const ipLimit = checkRateLimit(`customer-login-ip:${ip}`, {
    limit: 30,
    windowMs: 15 * 60 * 1_000,
  });
  const identityLimit = checkRateLimit(`customer-login:${identity}`, {
    limit: 8,
    windowMs: 15 * 60 * 1_000,
  });
  if (!ipLimit.allowed || !identityLimit.allowed) {
    return {
      status: "error",
      message: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: validation.values.email,
    password: validation.values.password,
  });
  if (error) {
    return { status: "error", message: INVALID_LOGIN_MESSAGE };
  }

  try {
    const authUserId = await getClaimsSubjectForClient(supabase);
    const account = authUserId ? await getCurrentCustomerAccount() : null;
    if (!account || account.authUserId !== authUserId) {
      await supabase.auth.signOut();
      return { status: "error", message: INVALID_LOGIN_MESSAGE };
    }
  } catch {
    await supabase.auth.signOut();
    return {
      status: "error",
      message: "El acceso no está disponible en este momento. Probá nuevamente.",
    };
  }

  const next = sanitizeCustomerReturnPath(
    typeof formData.get("next") === "string"
      ? String(formData.get("next"))
      : undefined,
  );
  redirect(next);
}

export async function registerRetailCustomer(
  _previousState: CustomerRegistrationActionState,
  formData: FormData,
): Promise<CustomerRegistrationActionState> {
  const validation = validateCustomerRegistration(formData);
  if (!validation.valid) {
    return { status: "error", message: validation.message };
  }

  const ip = await requestIp();
  const identity = rateLimitIdentity(`${ip}:${validation.values.email}`);
  const ipLimit = checkRateLimit(`customer-registration-ip:${ip}`, {
    limit: 10,
    windowMs: 60 * 60 * 1_000,
  });
  const identityLimit = checkRateLimit(`customer-registration:${identity}`, {
    limit: 3,
    windowMs: 60 * 60 * 1_000,
  });
  if (!ipLimit.allowed || !identityLimit.allowed) {
    return {
      status: "error",
      message: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const origin = configuredAppOrigin();
  const { data, error } = await supabase.auth.signUp({
    email: validation.values.email,
    password: validation.values.password,
    options: {
      emailRedirectTo: origin
        ? `${origin}/auth/confirm?next=/mi-cuenta`
        : undefined,
    },
  });

  if (error || !data.user?.id) {
    return {
      status: "error",
      message: "No pudimos crear la cuenta en este momento. Probá nuevamente.",
    };
  }

  // Supabase can return an obfuscated user for an already registered email.
  // Do not create or link a customer account unless a new identity was created.
  if (!data.user.identities?.length) {
    await supabase.auth.signOut();
    return {
      status: "success",
      message:
        "Revisá tu correo. Si ya tenías una cuenta, podés ingresar o recuperar tu contraseña.",
    };
  }

  try {
    await provisionRetailCustomerAccount(validation.values, data.user.id);
  } catch (provisionError) {
    await supabase.auth.signOut();
    return {
      status: "error",
      message:
        provisionError instanceof AdminStoreError && provisionError.status === 409
          ? "Ese email ya está asociado a una cuenta. Ingresá o recuperá tu contraseña."
          : "No pudimos completar la cuenta. No se guardaron datos incompletos.",
    };
  }

  if (data.session) redirect("/mi-cuenta");

  return {
    status: "success",
    message:
      "Te enviamos un correo de confirmación. Abrilo para activar tu cuenta Lombardo.",
  };
}

export async function logoutCustomer() {
  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  if (authUserId) await supabase.auth.signOut();
  redirect("/login");
}

export async function requestCustomerPasswordRecovery(
  _previousState: CustomerAccessActionState,
  formData: FormData,
): Promise<CustomerAccessActionState> {
  const email = normalizeCustomerEmail(
    typeof formData.get("email") === "string"
      ? String(formData.get("email"))
      : "",
  );
  const ip = await requestIp();
  const identity = rateLimitIdentity(`${ip}:${email}`);
  const rateLimit = checkRateLimit(`customer-recovery:${identity}`, {
    limit: 4,
    windowMs: 60 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "Esperá unos minutos antes de solicitar otro enlace.",
    };
  }

  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254) {
    const supabase = await createSupabaseServerClient();
    const origin = configuredAppOrigin();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: origin
        ? `${origin}/auth/callback?next=/nueva-clave`
        : undefined,
    });
  }

  // Deliberately generic: do not reveal whether an email/customer exists.
  return {
    status: "success",
    message:
      "Si el email corresponde a una cuenta activa, vas a recibir un enlace para continuar.",
  };
}

export async function updateCustomerPassword(
  _previousState: CustomerAccessActionState,
  formData: FormData,
): Promise<CustomerAccessActionState> {
  const validation = validateCustomerPassword(formData);
  if (!validation.valid) {
    return { status: "error", message: validation.message };
  }

  const ip = await requestIp();
  const rateLimit = checkRateLimit(`customer-password-update:${ip}`, {
    limit: 10,
    windowMs: 15 * 60 * 1_000,
  });
  if (!rateLimit.allowed) {
    return {
      status: "error",
      message: "Demasiados intentos. Esperá unos minutos y volvé a probar.",
    };
  }

  const supabase = await createSupabaseServerClient();
  const authUserId = await getClaimsSubjectForClient(supabase);
  const account = authUserId ? await getCurrentCustomerAccount() : null;
  if (!account || account.authUserId !== authUserId) {
    await supabase.auth.signOut();
    return {
      status: "error",
      message: "El enlace venció o la cuenta no está activa.",
    };
  }

  const { error } = await supabase.auth.updateUser({
    password: validation.password,
  });
  if (error) {
    return {
      status: "error",
      message: "No pudimos guardar la contraseña. Solicitá un enlace nuevo.",
    };
  }

  await supabase.auth.signOut();
  redirect("/login?password=updated");
}
