import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, beforeEach, describe, test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { orderDeletionBlocker, parseOrderDeletionInput } from "../lib/admin/order-deletion.ts";
import { SupabaseOrderStore } from "../lib/server/orders/supabase-order-store.ts";

const migration = readFileSync(new URL("../supabase/migrations/20260915133459_recoverable_order_deletion.sql", import.meta.url), "utf8");
const adminId = "11111111-1111-4111-8111-111111111111";
const operatorId = "22222222-2222-4222-8222-222222222222";
const inactiveId = "33333333-3333-4333-8333-333333333333";
const publicId = "0bb56f4c-f1f3-4c48-b3e0-73e4f28297d1";
const rpc = "select * from public.lombardo_admin_set_order_deleted($1,$2,$3,$4,$5,$6)";
const allowed = { paymentStatus: "pending", paymentMethod: "bank_transfer", fulfillmentStatus: "new" } as const;

test("la política del Admin bloquea pagos, operaciones y comprobantes pendientes", () => {
  assert.equal(orderDeletionBlocker(allowed), null);
  assert.equal(orderDeletionBlocker({ ...allowed, paymentMethod: "cash" }), null);
  assert.equal(orderDeletionBlocker({ ...allowed, paymentMethod: "whatsapp_coordination", fulfillmentStatus: "cancelled" }), null);
  for (const paymentStatus of ["approved", "refunded"] as const) assert.ok(orderDeletionBlocker({ ...allowed, paymentStatus }));
  for (const fulfillmentStatus of ["confirmed", "preparing", "ready", "delivered"] as const) assert.ok(orderDeletionBlocker({ ...allowed, fulfillmentStatus }));
  assert.ok(orderDeletionBlocker({ ...allowed, paymentMethod: "mercado_pago" }));
  assert.ok(orderDeletionBlocker({ ...allowed, paymentPreferenceId: "preference" }));
  assert.ok(orderDeletionBlocker({ ...allowed, paymentProviderId: "payment" }));
});

function form(overrides: Record<string, string> = {}) {
  const result = new FormData();
  for (const [key, value] of Object.entries({ publicId, expectedUpdatedAt: "2026-09-15T12:00:00.123456+00:00", deletionAction: "delete", reason: "Pedido duplicado", confirmed: "yes", ...overrides })) result.set(key, value);
  return result;
}

test("confirmación, motivo, UUID y versión se validan server-side", () => {
  assert.equal(parseOrderDeletionInput(form()).deleted, true);
  assert.equal(parseOrderDeletionInput(form({ deletionAction: "restore" })).deleted, false);
  const invalidForms: Record<string, string>[] = [{ publicId: "0BB56F4C" }, { confirmed: "" }, { reason: "  " }, { reason: "x".repeat(501) }, { expectedUpdatedAt: "mañana" }, { deletionAction: "purge" }];
  for (const changes of invalidForms) {
    assert.throws(() => parseOrderDeletionInput(form(changes)));
  }
});

describe("migración SQL en Postgres temporal, sin red ni datos reales", () => {
  let db: PGlite;
  before(async () => {
    db = await PGlite.create();
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create schema lombardo_private;
      create table auth.users(id uuid primary key);
      insert into auth.users values ('${adminId}'),('${operatorId}'),('${inactiveId}');
      create table public.lombardo_admin_operators(tenant_id text, auth_user_id uuid, role text, active boolean);
      insert into public.lombardo_admin_operators values ('lombardo','${adminId}','admin',true),('lombardo','${operatorId}','operator',true),('lombardo','${inactiveId}','admin',false);
      create table public.commerce_orders(
        id bigint primary key, public_id uuid default '${publicId}', tenant_id text not null,
        customer jsonb default '{"firstName":"TEST"}', items jsonb default '[{"sku":"TEST","quantity":2,"unitPrice":1000}]',
        total numeric default 2000, order_source text default 'whatsapp', order_status text default 'pending_payment',
        payment_status text default 'pending', payment_method text default 'bank_transfer', fulfillment_status text default 'new',
        payment_preference_id text, payment_provider_id text,
        management_revision integer not null default 0, created_at timestamptz not null default now(),
        updated_at timestamptz not null default '2026-09-15T12:00:00.123456Z'
      );
      alter table public.commerce_orders enable row level security;
      alter table public.commerce_orders force row level security;
      create policy fixture_customer_select on public.commerce_orders for select to authenticated using (tenant_id = 'lombardo');
      create table public.commerce_order_management_events(
        id bigint generated always as identity primary key, tenant_id text, order_id bigint references public.commerce_orders(id),
        action text constraint commerce_order_management_events_action_check check (action in ('manual_created','management_updated','payment_updated')),
        operator_user_id uuid references auth.users(id), before_snapshot jsonb, after_snapshot jsonb, reason text
      );
      create table public.commerce_order_notifications(id bigint generated always as identity, tenant_id text, order_id bigint, status text);
      create table public.commerce_order_payment_proofs(id bigint generated always as identity, tenant_id text, order_id bigint, review_status text);
      grant usage on schema public, lombardo_private to service_role;
      grant select, insert, update on all tables in schema public to service_role;
      grant usage on all sequences in schema public to service_role;
      grant select on public.commerce_orders to authenticated;
    `);
    await db.exec(migration);
  });
  after(async () => { await db?.close(); });
  beforeEach(async () => {
    await db.exec("reset role; truncate commerce_order_management_events, commerce_order_notifications, commerce_order_payment_proofs, commerce_orders;");
    await db.query("insert into commerce_orders(id,tenant_id) values (1,'lombardo'),(2,'other')");
  });
  async function row(id = 1) {
    return (await db.query<Record<string, unknown>>("select *,updated_at::text as version from commerce_orders where id=$1", [id])).rows[0];
  }
  async function change(deleted: boolean, actor = adminId, tenant = "lombardo", expected?: unknown, reason = "Pedido TEST") {
    const version = expected ?? (await row()).version;
    return db.query<{ changed: boolean; order_record: Record<string, unknown> }>(rpc, [tenant, 1, version, deleted, reason, actor]);
  }
  const snapshot = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([key]) => !["deleted_at", "deleted_by", "deletion_reason", "updated_at", "management_revision", "version"].includes(key)));

  test("elimina/restaura el mismo pedido sin cambiar snapshot, pago ni stock", async () => {
    const original = await row();
    await db.exec("set role service_role");
    const removed = await change(true);
    assert.equal(removed.rows[0].changed, true);
    const archived = await row();
    assert.ok(archived.deleted_at);
    assert.equal(archived.deleted_by, adminId);
    assert.equal(archived.management_revision, 1);
    assert.deepEqual(snapshot(archived), snapshot(original));
    const duplicate = await change(true);
    assert.equal(duplicate.rows[0].changed, false);
    await change(false, adminId, "lombardo", archived.version, "Eliminado por error");
    const restored = await row();
    assert.equal(restored.deleted_at, null);
    assert.equal(restored.deletion_reason, null);
    assert.deepEqual(snapshot(restored), snapshot(original));
    const events = await db.query<{ action: string; operator_user_id: string }>("select action,operator_user_id from commerce_order_management_events order by id");
    assert.deepEqual(events.rows.map((e) => e.action), ["deleted", "restored"]);
    assert.ok(events.rows.every((e) => e.operator_user_id === adminId));
    assert.equal((await db.query("select * from commerce_order_notifications")).rows.length, 0);
  });

  test("admin activo del tenant obligatorio; operador/inactivo/cross-tenant rechazados", async () => {
    for (const actor of [operatorId, inactiveId, "44444444-4444-4444-8444-444444444444"]) await assert.rejects(change(true, actor), { code: "42501" });
    await assert.rejects(change(true, adminId, "other"), { code: "42501" });
    await assert.rejects(db.query(rpc, ["lombardo", 2, (await row(2)).version, true, "TEST", adminId]), { code: "P0002" });
    assert.equal((await row()).deleted_at, null);
  });

  test("concurrencia y motivos inválidos no generan auditorías ni eliminaciones", async () => {
    await assert.rejects(change(true, adminId, "lombardo", "2026-09-14T12:00:00Z"), { code: "40001" });
    await assert.rejects(change(true, adminId, "lombardo", undefined, " "), { code: "23514" });
    const oldVersion = (await row()).version;
    await change(true);
    await assert.rejects(change(false, adminId, "lombardo", oldVersion), { code: "40001" });
    assert.equal((await db.query("select * from commerce_order_management_events")).rows.length, 1);
  });

  test("bloquea pedidos pagados, procesados y Mercado Pago incluso sin preference todavía", async () => {
    for (const patch of ["payment_status='approved'", "payment_status='refunded'", "fulfillment_status='confirmed'", "fulfillment_status='preparing'", "fulfillment_status='ready'", "fulfillment_status='delivered'", "payment_method='mercado_pago'", "payment_preference_id='TEST'", "payment_provider_id='TEST'"]) {
      await db.query("update commerce_orders set payment_status='pending',fulfillment_status='new',payment_method='bank_transfer',payment_preference_id=null,payment_provider_id=null where id=1");
      await db.query(`update commerce_orders set ${patch} where id=1`);
      await assert.rejects(change(true), { message: "ORDER_DELETE_UNSAFE" });
    }
  });

  test("comprobante pendiente y notificación en curso bloquean la eliminación", async () => {
    await db.query("insert into commerce_order_payment_proofs(tenant_id,order_id,review_status) values ('lombardo',1,'pending_review')");
    await assert.rejects(change(true), { message: "ORDER_PROOF_PENDING" });
    await db.exec("truncate commerce_order_payment_proofs");
    for (const status of ["sending", "unknown"]) {
      await db.query("insert into commerce_order_notifications(tenant_id,order_id,status) values ('lombardo',1,$1)", [status]);
      await assert.rejects(change(true), { message: "ORDER_NOTIFICATION_IN_FLIGHT" });
      await db.exec("truncate commerce_order_notifications");
    }
  });

  test("pedido eliminado no admite cambios, comprobantes ni nuevos envíos", async () => {
    await db.query("insert into commerce_order_notifications(tenant_id,order_id,status) values ('lombardo',1,'pending')");
    await change(true);
    await assert.rejects(db.query("update commerce_orders set payment_status='approved' where id=1"), { message: "ORDER_DELETED" });
    await assert.rejects(db.query("update commerce_order_notifications set status='sending' where order_id=1"), { message: "ORDER_DELETED" });
    await assert.rejects(db.query("insert into commerce_order_notifications(tenant_id,order_id,status) values ('lombardo',1,'pending')"), { message: "ORDER_DELETED" });
    await assert.rejects(db.query("insert into commerce_order_payment_proofs(tenant_id,order_id,review_status) values ('lombardo',1,'pending_review')"), { message: "ORDER_DELETED" });
    await assert.rejects(db.query("update commerce_orders set deleted_at=null,deleted_by=null,deletion_reason=null,total=1 where id=1"), { code: "23514" });
  });

  test("browser sin RPC y RLS conserva ownership ocultando pedidos eliminados", async () => {
    await change(true);
    const permissions = await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','public.lombardo_admin_set_order_deleted(text,bigint,timestamptz,boolean,text,uuid)','execute') as allowed");
    assert.equal(permissions.rows[0].allowed, false);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select id from commerce_orders")).rows.length, 0);
    await assert.rejects(db.query(rpc, ["lombardo", 1, "2026-09-15T12:00:00Z", false, "TEST", adminId]), { code: "42501" });
    await db.exec("reset role");
    await change(false);
    await db.exec("set role authenticated");
    assert.deepEqual((await db.query<{ id: number }>("select id from commerce_orders")).rows.map((r) => Number(r.id)), [1]);
  });
});

test("consultas públicas excluyen eliminados pero idempotencia no recrea la orden", async () => {
  const paths: URL[] = [];
  const store = new SupabaseOrderStore({ url: "https://example.supabase.co", secretKey: "TEST", fetcher: async (input) => {
    const url = new URL(String(input)); paths.push(url);
    return Response.json(url.searchParams.has("deleted_at") ? [] : [{ deleted_at: "2026-09-15T12:00:00Z" }]);
  } });
  assert.equal(await store.getByPublicId("lombardo", publicId), null);
  assert.equal(await store.getByConversationSession("lombardo", "TEST"), null);
  await assert.rejects(store.findByIdempotency("lombardo", "TEST", "TEST"), { status: 409 });
  assert.equal(paths[0].searchParams.get("deleted_at"), "is.null");
  assert.equal(paths[1].searchParams.get("deleted_at"), "is.null");
  assert.equal(paths[2].searchParams.has("deleted_at"), false);
});

test("acción y UI separan papelera de cancelación sin llamar notificaciones", () => {
  const actions = readFileSync(new URL("../app/admin/actions.ts", import.meta.url), "utf8");
  const deletionAction = actions.split("export async function setOrderDeletedAction")[1]?.split("export async function")[0] ?? "";
  assert.match(deletionAction, /requireAdminRole\("admin"\)/);
  assert.doesNotMatch(deletionAction, /customerUpdateFeedback|notify|transitionOrder/);
  const detail = readFileSync(new URL("../app/admin/(protected)/pedidos/[publicId]/page.tsx", import.meta.url), "utf8");
  assert.match(detail, /!order.deletedAt \? <OrderActions/);
  assert.match(detail, /OrderDeletionActions/);
  assert.doesNotMatch(migration, /delete from public\.commerce_orders/i);
});
