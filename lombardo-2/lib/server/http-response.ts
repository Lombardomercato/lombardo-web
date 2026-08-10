import type { OrderRepositoryErrorPayload } from "../../types/checkout.ts";
import { ServerOrderError } from "./orders/server-order-error.ts";

export function noStoreJson(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return Response.json(body, { ...init, headers });
}

export function serverErrorResponse(error: unknown) {
  if (error instanceof ServerOrderError) {
    const payload: OrderRepositoryErrorPayload = {
      code: error.code,
      message: error.message,
      priceChanges: error.priceChanges,
    };
    return noStoreJson(payload, { status: error.status });
  }
  const payload: OrderRepositoryErrorPayload = {
    code: "CREATE_FAILED",
    message: "No pudimos completar la operación. Probá nuevamente.",
  };
  return noStoreJson(payload, { status: 500 });
}
