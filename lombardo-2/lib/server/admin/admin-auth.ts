import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readAdminConfiguration } from "../environment";
import { RuniaAdminStore } from "./runia-admin-store";

const ADMIN_COOKIE = "lombardo_admin_session";
const SESSION_SECONDS = 12 * 60 * 60;

interface SupabaseAuthUser {
  id: string;
  email?: string;
}

interface PasswordResponse {
  access_token?: string;
}

function sessionHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createAdminStore() {
  const configuration = readAdminConfiguration();
  return new RuniaAdminStore({
    url: configuration.url,
    secretKey: configuration.secretKey,
    tenantId: configuration.tenantSlug,
  });
}

export async function authenticateAdminCredentials(
  email: string,
  password: string,
) {
  const configuration = readAdminConfiguration();
  const passwordResponse = await fetch(
    `${configuration.url}/auth/v1/token?grant_type=password`,
    {
      method: "POST",
      headers: {
        apikey: configuration.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    },
  );
  if (!passwordResponse.ok) return null;
  const passwordPayload = (await passwordResponse.json()) as PasswordResponse;
  if (!passwordPayload.access_token) return null;

  const userResponse = await fetch(`${configuration.url}/auth/v1/user`, {
    headers: {
      apikey: configuration.publishableKey,
      Authorization: `Bearer ${passwordPayload.access_token}`,
    },
    cache: "no-store",
  });
  if (!userResponse.ok) return null;
  const user = (await userResponse.json()) as SupabaseAuthUser;
  if (!user.id) return null;

  const store = createAdminStore();
  const operator = await store.findOperatorByAuthUser(user.id);
  if (!operator) return null;

  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await store.createSession(operator.id, sessionHash(token), expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: SESSION_SECONDS,
    priority: "high",
  });
  return operator;
}

export const getOptionalAdminSession = cache(async () => {
  const token = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (!token || token.length < 32 || token.length > 128) return null;
  return createAdminStore().getSession(sessionHash(token));
});

export async function requireAdminSession() {
  const session = await getOptionalAdminSession();
  if (!session) redirect("/admin/login");
  return session;
}

export async function requireAdminRole(role: "admin") {
  const session = await requireAdminSession();
  if (session.role !== role) {
    throw new Error("Esta acción requiere permisos de administrador.");
  }
  return session;
}

export async function revokeAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE)?.value;
  if (token) {
    await createAdminStore().revokeSession(sessionHash(token));
  }
  cookieStore.set(ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/admin",
    maxAge: 0,
  });
}
