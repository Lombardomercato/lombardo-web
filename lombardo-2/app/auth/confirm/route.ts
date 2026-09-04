import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";

import {
  getCurrentCustomerAccount,
  getClaimsSubjectForClient,
} from "@/lib/server/customers/customer-auth";
import { sanitizeCustomerReturnPath } from "@/lib/server/customers/validation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const CUSTOMER_EMAIL_TYPES = new Set<EmailOtpType>([
  "invite",
  "recovery",
  "signup",
]);

function loginError(request: NextRequest) {
  return NextResponse.redirect(new URL("/login?auth=invalid", request.url));
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const next = sanitizeCustomerReturnPath(
    request.nextUrl.searchParams.get("next"),
    "/nueva-clave",
  );
  const supabase = await createSupabaseServerClient();

  let error: unknown = null;
  if (code) {
    ({ error } = await supabase.auth.exchangeCodeForSession(code));
  } else if (
    tokenHash &&
    rawType &&
    CUSTOMER_EMAIL_TYPES.has(rawType as EmailOtpType)
  ) {
    ({ error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    }));
  } else {
    return loginError(request);
  }

  if (error) return loginError(request);

  const authUserId = await getClaimsSubjectForClient(supabase);
  const account = authUserId ? await getCurrentCustomerAccount() : null;
  if (!account || account.authUserId !== authUserId) {
    await supabase.auth.signOut();
    return loginError(request);
  }

  return NextResponse.redirect(new URL(next, request.url));
}
