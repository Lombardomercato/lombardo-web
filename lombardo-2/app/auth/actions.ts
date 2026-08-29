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
} from "@/lib/server/customers/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface CustomerLoginActionState {
  status: "idle" | "error";
  message: string;
}

export interface CustomerAccessActionState {
  status: "idle" | "error" | "success";
  message: string;
}

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
