import "server-only";

import type { Product } from "@/types/commerce";
import type {
  AutomationContentEntry,
  AutomationRun,
  AutomationStatus,
  AutomationTrigger,
  AutomationType,
  HomeDailyState,
  HomeFeaturePin,
} from "@/lib/automations/types";

interface StoreOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

interface RunRow {
  id: string;
  automation_type: AutomationType;
  run_key: string;
  trigger_source: AutomationTrigger;
  status: AutomationStatus;
  attempt: number;
  started_at: string;
  finished_at: string | null;
  summary: Record<string, unknown>;
  warnings: string[];
  errors: string[];
  alert_status: string;
}

interface ContentRow {
  id: string;
  content_type: "GUIDE" | "ARTICLE";
  slug: string;
  title: string;
  workflow_status: AutomationContentEntry["workflowStatus"];
  live_rules: AutomationContentEntry["liveRules"];
  last_live_refresh_at: string | null;
}

interface PinRow {
  id: string;
  supplier_product_id: string;
  position: number;
  created_at: string;
  product:
    | { supplier_sku: string; name_raw: string }
    | Array<{ supplier_sku: string; name_raw: string }>;
}

export class AutomationStoreError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

function mapRun(row: RunRow): AutomationRun {
  return {
    id: row.id,
    type: row.automation_type,
    runKey: row.run_key,
    trigger: row.trigger_source,
    status: row.status,
    attempt: row.attempt,
    startedAt: row.started_at,
    finishedAt: row.finished_at ?? undefined,
    summary: row.summary ?? {},
    warnings: Array.isArray(row.warnings) ? row.warnings : [],
    errors: Array.isArray(row.errors) ? row.errors : [],
    alertStatus: row.alert_status,
  };
}

function relationOne<T>(value: T | T[] | null) {
  return Array.isArray(value) ? value[0] : value;
}

export class AutomationStore {
  private readonly url: string;
  private readonly secretKey: string;
  private readonly tenantSlug: string;
  private readonly fetcher: typeof fetch;
  private tenantIdPromise: Promise<string> | null = null;

  constructor(options: StoreOptions) {
    this.url = options.url.replace(/\/$/, "");
    this.secretKey = options.secretKey;
    this.tenantSlug = options.tenantSlug;
    this.fetcher = options.fetcher ?? fetch;
  }

  private headers(prefer?: string) {
    const headers: Record<string, string> = {
      apikey: this.secretKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
    if (!this.secretKey.startsWith("sb_secret_")) {
      headers.Authorization = `Bearer ${this.secretKey}`;
    }
    if (prefer) headers.Prefer = prefer;
    return headers;
  }

  private request(path: string, init: RequestInit = {}, prefer?: string) {
    return this.fetcher(`${this.url}/rest/v1/${path}`, {
      ...init,
      headers: { ...this.headers(prefer), ...init.headers },
      cache: "no-store",
    });
  }

  private async rows<T>(path: string, message: string) {
    const response = await this.request(path);
    if (!response.ok) throw new AutomationStoreError(message, response.status);
    return (await response.json()) as T[];
  }

  private async rpc<T>(name: string, body: Record<string, unknown>, message: string) {
    const response = await this.request(`rpc/${name}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new AutomationStoreError(message, response.status);
    return (await response.json()) as T;
  }

  async tenantId() {
    this.tenantIdPromise ??= (async () => {
      const search = new URLSearchParams({
        select: "id",
        slug: `eq.${this.tenantSlug}`,
        status: "eq.active",
        limit: "2",
      });
      const rows = await this.rows<{ id: string }>(
        `tenants?${search}`,
        "No pudimos resolver el tenant de las automatizaciones.",
      );
      if (rows.length !== 1) throw new AutomationStoreError("El tenant activo no es unívoco.");
      return rows[0].id;
    })().catch((error: unknown) => {
      this.tenantIdPromise = null;
      throw error;
    });
    return this.tenantIdPromise;
  }

  async claim(input: {
    type: AutomationType;
    runKey: string;
    trigger: AutomationTrigger;
    createdBy?: string;
  }) {
    const result = await this.rpc<{
      claimed: boolean;
      reason?: string;
      runId?: string;
      attempt?: number;
    }>("lombardo_claim_automation_run", {
      p_tenant_id: await this.tenantId(),
      p_automation_type: input.type,
      p_run_key: input.runKey,
      p_trigger_source: input.trigger,
      p_created_by: input.createdBy ?? null,
    }, "No pudimos adquirir el lock de la automatización.");
    return result;
  }

  async finishRun(input: {
    runId: string;
    status: Exclude<AutomationStatus, "running">;
    summary: Record<string, unknown>;
    warnings?: string[];
    errors?: string[];
    alertRequired?: boolean;
  }) {
    const search = new URLSearchParams({ id: `eq.${input.runId}`, status: "eq.running" });
    const response = await this.request(`automation_runs?${search}`, {
      method: "PATCH",
      body: JSON.stringify({
        status: input.status,
        finished_at: new Date().toISOString(),
        heartbeat_at: new Date().toISOString(),
        summary: input.summary,
        warnings: input.warnings ?? [],
        errors: input.errors ?? [],
        alert_status: input.alertRequired ? "pending" : "not_required",
      }),
    }, "return=minimal");
    if (!response.ok) throw new AutomationStoreError("No pudimos cerrar la ejecución.", response.status);
  }

  async recordAlert(runId: string, input: { status: "sent" | "failed"; messageId?: string; error?: string }) {
    const search = new URLSearchParams({ id: `eq.${runId}` });
    const response = await this.request(`automation_runs?${search}`, {
      method: "PATCH",
      body: JSON.stringify({
        alert_status: input.status,
        alert_sent_at: input.status === "sent" ? new Date().toISOString() : null,
        alert_provider_message_id: input.messageId ?? null,
        alert_error_summary: input.error?.slice(0, 300) ?? null,
      }),
    }, "return=minimal");
    if (!response.ok) throw new AutomationStoreError("No pudimos auditar la alerta.", response.status);
  }

  async latestRuns() {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,automation_type,run_key,trigger_source,status,attempt,started_at,finished_at,summary,warnings,errors,alert_status",
      tenant_id: `eq.${tenantId}`,
      order: "started_at.desc",
      limit: "100",
    });
    const rows = await this.rows<RunRow>(`automation_runs?${search}`, "No pudimos cargar las automatizaciones.");
    const latest = new Map<AutomationType, AutomationRun>();
    for (const row of rows) if (!latest.has(row.automation_type)) latest.set(row.automation_type, mapRun(row));
    return latest;
  }

  async latestVinrosRun() {
    const supplierSearch = new URLSearchParams({
      select: "id",
      code: "eq.vinros",
      "tenants.slug": `eq.${this.tenantSlug}`,
      limit: "2",
    });
    supplierSearch.set("select", "id,tenants:tenant_id!inner(slug)");
    const suppliers = await this.rows<{ id: string }>(`suppliers?${supplierSearch}`, "No pudimos resolver VINROS.");
    if (suppliers.length !== 1) throw new AutomationStoreError("VINROS no es unívoco.");
    const search = new URLSearchParams({
      select: "id,status,started_at,finished_at,products,prices_changed,blocked,pending_review,supplier_only_cost,warnings,errors,error_summary,dry_run_result,write_result",
      supplier_id: `eq.${suppliers[0].id}`,
      order: "started_at.desc",
      limit: "1",
    });
    return (await this.rows<Record<string, unknown>>(
      `supplier_sync_automation_runs?${search}`,
      "No pudimos leer el estado de VINROS.",
    ))[0] ?? null;
  }

  async recentFeaturedProductIds(beforeDate: string, days = 7) {
    const tenantId = await this.tenantId();
    const threshold = new Date(`${beforeDate}T12:00:00Z`);
    threshold.setUTCDate(threshold.getUTCDate() - days);
    const search = new URLSearchParams({
      select: "supplier_product_id",
      tenant_id: `eq.${tenantId}`,
      slot_type: "eq.featured_product",
      limit: "1000",
    });
    search.append("selection_date", `gte.${threshold.toISOString().slice(0, 10)}`);
    search.append("selection_date", `lt.${beforeDate}`);
    const rows = await this.rows<{ supplier_product_id: string }>(
      `home_daily_slots?${search}`,
      "No pudimos leer el historial de destacados.",
    );
    return new Set(rows.map((row) => row.supplier_product_id));
  }

  async listPins(): Promise<HomeFeaturePin[]> {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,supplier_product_id,position,created_at,product:supplier_product_id!inner(supplier_sku,name_raw)",
      tenant_id: `eq.${tenantId}`,
      active: "is.true",
      order: "position.asc,created_at.asc",
      limit: "6",
    });
    const rows = await this.rows<PinRow>(
      `home_feature_pins?${search}`,
      "No pudimos cargar los PIN de Home.",
    );
    return rows.map((row) => {
      const product = relationOne(row.product)!;
      return {
        id: row.id,
        productId: row.supplier_product_id,
        sku: product.supplier_sku,
        name: product.name_raw,
        position: row.position,
        createdAt: row.created_at,
      };
    });
  }

  async pinProductBySku(sku: string, position: number, operatorId: string) {
    const tenantId = await this.tenantId();
    const productSearch = new URLSearchParams({
      select: "id,supplier:supplier_id!inner(tenant_id)",
      supplier_sku: `eq.${sku}`,
      eligibility_status: "eq.safe",
      active: "is.true",
      "supplier.tenant_id": `eq.${tenantId}`,
      limit: "2",
    });
    const products = await this.rows<{ id: string }>(`supplier_products?${productSearch}`, "No pudimos validar el producto.");
    if (products.length !== 1) throw new AutomationStoreError("El SKU debe identificar un único producto SAFE.", 422);
    const response = await this.request("home_feature_pins?on_conflict=tenant_id,supplier_product_id", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        supplier_product_id: products[0].id,
        active: true,
        position,
        pinned_by: operatorId,
      }),
    }, "resolution=merge-duplicates,return=minimal");
    if (!response.ok) throw new AutomationStoreError("No pudimos fijar el producto.", response.status);
  }

  async unpinProduct(pinId: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({ id: `eq.${pinId}`, tenant_id: `eq.${tenantId}` });
    const response = await this.request(`home_feature_pins?${search}`, {
      method: "PATCH",
      body: JSON.stringify({ active: false }),
    }, "return=minimal");
    if (!response.ok) throw new AutomationStoreError("No pudimos quitar el PIN.", response.status);
  }

  async replaceHomeSlots(runId: string, date: string, input: {
    products: Array<{ productId: string; isPinned: boolean }>;
    categories: string[];
    guides: string[];
  }) {
    const slots = [
      ...input.products.map((product, position) => ({ slotType: "featured_product", position, ...product })),
      ...input.categories.map((categorySlug, position) => ({ slotType: "featured_category", position, categorySlug })),
      ...input.guides.map((categorySlug, position) => ({ slotType: "featured_guide", position, categorySlug })),
    ];
    return this.rpc<number>("lombardo_replace_home_daily_slots", {
      p_tenant_id: await this.tenantId(),
      p_run_id: runId,
      p_selection_date: date,
      p_slots: slots,
    }, "No pudimos guardar la rotación diaria de Home.");
  }

  async getHomeDailyState(date: string): Promise<HomeDailyState | null> {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "selection_date,slot_type,position,supplier_product_id,category_slug",
      tenant_id: `eq.${tenantId}`,
      "selection_date.lte": date,
      order: "selection_date.desc,slot_type.asc,position.asc",
      limit: "100",
    });
    const rows = await this.rows<{
      selection_date: string;
      slot_type: "featured_product" | "featured_category" | "featured_guide";
      position: number;
      supplier_product_id: string | null;
      category_slug: string | null;
    }>(`home_daily_slots?${search}`, "No pudimos leer la selección diaria.");
    const selectedDate = rows[0]?.selection_date;
    if (!selectedDate) return null;
    const selected = rows.filter((row) => row.selection_date === selectedDate);
    return {
      selectionDate: selectedDate,
      productIds: selected.filter((row) => row.slot_type === "featured_product").flatMap((row) => row.supplier_product_id ? [row.supplier_product_id] : []),
      categorySlugs: selected.filter((row) => row.slot_type === "featured_category").flatMap((row) => row.category_slug ? [row.category_slug] : []),
      guideSlugs: selected.filter((row) => row.slot_type === "featured_guide").flatMap((row) => row.category_slug ? [row.category_slug] : []),
      fallback: selectedDate !== date,
    };
  }

  async upsertContentEntry(input: {
    type: "GUIDE" | "ARTICLE";
    slug: string;
    title: string;
    workflowStatus: AutomationContentEntry["workflowStatus"];
    editorialContent?: Record<string, unknown>;
    liveRules: AutomationContentEntry["liveRules"];
  }) {
    const tenantId = await this.tenantId();
    const response = await this.request("automation_content_entries?on_conflict=tenant_id,slug&select=id", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: tenantId,
        content_type: input.type,
        slug: input.slug,
        title: input.title,
        workflow_status: input.workflowStatus,
        editorial_content: input.editorialContent ?? {},
        live_rules: input.liveRules,
        published_at: input.workflowStatus === "PUBLISHED" ? new Date().toISOString() : null,
      }),
    }, "resolution=merge-duplicates,return=representation");
    if (!response.ok) throw new AutomationStoreError("No pudimos registrar el contenido dinámico.", response.status);
    return ((await response.json()) as Array<{ id: string }>)[0]?.id;
  }

  async listContent(input: { type?: "GUIDE" | "ARTICLE"; statuses?: AutomationContentEntry["workflowStatus"][] }) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,content_type,slug,title,workflow_status,live_rules,last_live_refresh_at",
      tenant_id: `eq.${tenantId}`,
      order: "updated_at.desc",
      limit: "200",
    });
    if (input.type) search.set("content_type", `eq.${input.type}`);
    if (input.statuses?.length) search.set("workflow_status", `in.(${input.statuses.join(",")})`);
    const rows = await this.rows<ContentRow>(`automation_content_entries?${search}`, "No pudimos cargar el pipeline de contenido.");
    return rows.map((row): AutomationContentEntry => ({
      id: row.id,
      type: row.content_type,
      slug: row.slug,
      title: row.title,
      workflowStatus: row.workflow_status,
      liveRules: row.live_rules ?? {},
      lastLiveRefreshAt: row.last_live_refresh_at ?? undefined,
    }));
  }

  async replaceContentProducts(runId: string, entryId: string, products: Product[]) {
    return this.rpc<number>("lombardo_replace_content_product_slots", {
      p_tenant_id: await this.tenantId(),
      p_run_id: runId,
      p_content_entry_id: entryId,
      p_products: products.map((product, position) => ({
        productId: product.id,
        position,
        price: product.price,
      })),
    }, "No pudimos actualizar los productos vivos del contenido.");
  }

  async contentProductIds(slug: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "position,supplier_product_id,entry:content_entry_id!inner(slug,workflow_status)",
      tenant_id: `eq.${tenantId}`,
      "entry.slug": `eq.${slug}`,
      "entry.workflow_status": "eq.PUBLISHED",
      order: "position.asc",
      limit: "50",
    });
    const rows = await this.rows<{ supplier_product_id: string }>(
      `automation_content_product_slots?${search}`,
      "No pudimos cargar los productos de la guía.",
    );
    return rows.map((row) => row.supplier_product_id);
  }
}
