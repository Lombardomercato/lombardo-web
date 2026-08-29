import "server-only";

import type {
  SecretCellarAttempt,
  SecretCellarAttemptResult,
  SecretCellarChallenge,
  SecretCellarExclusion,
  SecretCellarSettings,
} from "@/lib/secret-cellar/types";

interface StoreOptions {
  url: string;
  secretKey: string;
  tenantSlug: string;
  fetcher?: typeof fetch;
}

interface ChallengeRow {
  id: string;
  tenant_id: string;
  challenge_date: string;
  status: "ACTIVE" | "SCHEDULED";
  secret_product_id: string;
  candidates: SecretCellarChallenge["candidates"];
  clues: SecretCellarChallenge["clues"];
  reward_percentage: number | string;
  reward_valid_hours: number;
  generated_by: SecretCellarChallenge["generatedBy"];
  created_at: string;
}

interface SettingsRow {
  enabled: boolean;
  candidate_count: number;
  clue_count: number;
  reward_percentage: number | string;
  reward_valid_hours: number;
}

interface AttemptRow {
  id: number;
  player_key: string;
  guest_contact_masked: string | null;
  selected_product_id: string;
  result: "FOUND" | "MISSED";
  promotion_id: string | null;
  coupon_code: string | null;
  attempted_at: string;
}

interface ExclusionRow {
  product_id: string;
  reason: string;
  created_at: string;
  product:
    | { name_raw: string; supplier_sku: string }
    | Array<{ name_raw: string; supplier_sku: string }>
    | null;
}

export class SecretCellarStoreError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

function currentArgentinaDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Cordoba",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function mapSettings(row: SettingsRow): SecretCellarSettings {
  return {
    enabled: row.enabled,
    candidateCount: row.candidate_count,
    clueCount: row.clue_count,
    rewardPercentage: Number(row.reward_percentage),
    rewardValidHours: row.reward_valid_hours,
  };
}

function mapChallenge(row: ChallengeRow): SecretCellarChallenge {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    date: row.challenge_date,
    status: row.challenge_date === currentArgentinaDate() ? "ACTIVE" : row.status,
    secretProductId: row.secret_product_id,
    candidates: row.candidates,
    clues: row.clues,
    rewardPercentage: Number(row.reward_percentage),
    rewardValidHours: row.reward_valid_hours,
    generatedBy: row.generated_by,
    createdAt: row.created_at,
  };
}

export class SecretCellarStore {
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
    if (!response.ok) throw new SecretCellarStoreError(message, response.status);
    return (await response.json()) as T[];
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
        "No pudimos resolver la cava de Lombardo.",
      );
      if (rows.length !== 1) {
        throw new SecretCellarStoreError("La cava no tiene un tenant activo unívoco.", 503);
      }
      return rows[0].id;
    })().catch((error: unknown) => {
      this.tenantIdPromise = null;
      throw error;
    });
    return this.tenantIdPromise;
  }

  async getSettings(): Promise<SecretCellarSettings> {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "enabled,candidate_count,clue_count,reward_percentage,reward_valid_hours",
      tenant_id: `eq.${tenantId}`,
      limit: "1",
    });
    let row = (await this.rows<SettingsRow>(
      `secret_cellar_settings?${search}`,
      "No pudimos cargar la configuración de la cava.",
    ))[0];
    if (!row) {
      const response = await this.request(
        "secret_cellar_settings?on_conflict=tenant_id&select=enabled,candidate_count,clue_count,reward_percentage,reward_valid_hours",
        { method: "POST", body: JSON.stringify({ tenant_id: tenantId }) },
        "resolution=ignore-duplicates,return=representation",
      );
      if (!response.ok) {
        throw new SecretCellarStoreError("No pudimos inicializar la configuración de la cava.");
      }
      row = ((await response.json()) as SettingsRow[])[0] ?? (await this.rows<SettingsRow>(
        `secret_cellar_settings?${search}`,
        "No pudimos cargar la configuración de la cava.",
      ))[0];
    }
    if (!row) throw new SecretCellarStoreError("La configuración de la cava no existe.");
    return mapSettings(row);
  }

  async updateSettings(input: SecretCellarSettings, operatorId: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({ tenant_id: `eq.${tenantId}` });
    const response = await this.request(`secret_cellar_settings?${search}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: input.enabled,
        candidate_count: input.candidateCount,
        clue_count: input.clueCount,
        reward_percentage: input.rewardPercentage,
        reward_valid_hours: input.rewardValidHours,
        updated_by: operatorId,
      }),
    }, "return=minimal");
    if (!response.ok) throw new SecretCellarStoreError("No pudimos guardar la configuración.");
  }

  async getChallenge(date: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,tenant_id,challenge_date,status,secret_product_id,candidates,clues,reward_percentage,reward_valid_hours,generated_by,created_at",
      tenant_id: `eq.${tenantId}`,
      challenge_date: `eq.${date}`,
      limit: "1",
    });
    const row = (await this.rows<ChallengeRow>(
      `secret_cellar_challenges?${search}`,
      "No pudimos abrir el desafío de hoy.",
    ))[0];
    return row ? mapChallenge(row) : null;
  }

  async getChallengeById(id: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,tenant_id,challenge_date,status,secret_product_id,candidates,clues,reward_percentage,reward_valid_hours,generated_by,created_at",
      tenant_id: `eq.${tenantId}`,
      id: `eq.${id}`,
      limit: "1",
    });
    const row = (await this.rows<ChallengeRow>(
      `secret_cellar_challenges?${search}`,
      "No pudimos validar el desafío.",
    ))[0];
    return row ? mapChallenge(row) : null;
  }

  async createChallenge(
    challenge: Omit<SecretCellarChallenge, "id"> & { id?: string },
  ) {
    const response = await this.request("secret_cellar_challenges?select=id,tenant_id,challenge_date,status,secret_product_id,candidates,clues,reward_percentage,reward_valid_hours,generated_by,created_at", {
      method: "POST",
      body: JSON.stringify({
        tenant_id: challenge.tenantId,
        challenge_date: challenge.date,
        status: challenge.status,
        secret_product_id: challenge.secretProductId,
        candidates: challenge.candidates,
        clues: challenge.clues,
        reward_percentage: challenge.rewardPercentage,
        reward_valid_hours: challenge.rewardValidHours,
        generated_by: challenge.generatedBy,
      }),
    }, "return=representation");
    if (response.status === 409) return this.getChallenge(challenge.date);
    if (!response.ok) throw new SecretCellarStoreError("No pudimos guardar el desafío diario.", response.status);
    const row = ((await response.json()) as ChallengeRow[])[0];
    return row ? mapChallenge(row) : null;
  }

  async deleteScheduledChallenge(date: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      tenant_id: `eq.${tenantId}`,
      challenge_date: `eq.${date}`,
      status: "eq.SCHEDULED",
    });
    const response = await this.request(`secret_cellar_challenges?${search}`, { method: "DELETE" });
    if (!response.ok) throw new SecretCellarStoreError("No pudimos regenerar el próximo desafío.");
  }

  async exclusionIds() {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({ select: "product_id", tenant_id: `eq.${tenantId}`, limit: "10000" });
    return new Set((await this.rows<{ product_id: string }>(
      `secret_cellar_exclusions?${search}`,
      "No pudimos cargar las exclusiones.",
    )).map((row) => row.product_id));
  }

  async listExclusions(): Promise<SecretCellarExclusion[]> {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "product_id,reason,created_at,product:product_id(name_raw,supplier_sku)",
      tenant_id: `eq.${tenantId}`,
      order: "created_at.desc",
      limit: "1000",
    });
    const rows = await this.rows<ExclusionRow>(
      `secret_cellar_exclusions?${search}`,
      "No pudimos cargar las exclusiones.",
    );
    return rows.map((row) => {
      const product = Array.isArray(row.product) ? row.product[0] : row.product;
      return {
        productId: row.product_id,
        productName: product?.name_raw ?? "Producto sin nombre",
        productSku: product?.supplier_sku ?? "—",
        reason: row.reason,
        createdAt: row.created_at,
      };
    });
  }

  async addExclusion(productId: string, reason: string, operatorId: string) {
    const tenantId = await this.tenantId();
    const response = await this.request("secret_cellar_exclusions?on_conflict=tenant_id,product_id", {
      method: "POST",
      body: JSON.stringify({ tenant_id: tenantId, product_id: productId, reason, created_by: operatorId }),
    }, "resolution=merge-duplicates,return=minimal");
    if (!response.ok) throw new SecretCellarStoreError("No pudimos excluir el producto.", response.status);
  }

  async removeExclusion(productId: string) {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({ tenant_id: `eq.${tenantId}`, product_id: `eq.${productId}` });
    const response = await this.request(`secret_cellar_exclusions?${search}`, { method: "DELETE" });
    if (!response.ok) throw new SecretCellarStoreError("No pudimos quitar la exclusión.");
  }

  async submitAttempt(input: {
    challengeId: string;
    selectedProductId: string;
    playerKey: string;
    customerAccountId?: string;
    guestContactKind?: "EMAIL" | "WHATSAPP";
    guestContactHash?: string;
    guestContactMasked?: string;
  }): Promise<Omit<SecretCellarAttemptResult, "secret">> {
    const tenantId = await this.tenantId();
    const response = await this.request("rpc/lombardo_submit_secret_cellar_attempt", {
      method: "POST",
      body: JSON.stringify({
        p_tenant_id: tenantId,
        p_challenge_id: input.challengeId,
        p_selected_product_id: input.selectedProductId,
        p_player_key: input.playerKey,
        p_customer_account_id: input.customerAccountId ?? null,
        p_guest_contact_kind: input.guestContactKind ?? null,
        p_guest_contact_hash: input.guestContactHash ?? null,
        p_guest_contact_masked: input.guestContactMasked ?? null,
      }),
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { message?: string };
      const message = body.message ?? "";
      if (message.includes("NOT_ACTIVE")) throw new SecretCellarStoreError("La cava ya cambió de desafío.", 409);
      if (message.includes("NOT_CANDIDATE")) throw new SecretCellarStoreError("Esa botella no participa del desafío.", 422);
      throw new SecretCellarStoreError("No pudimos registrar el intento.", response.status);
    }
    type RpcResult = {
      status: "RECORDED" | "ALREADY_PLAYED";
      result: "FOUND" | "MISSED";
      couponCode?: string | null;
      couponExpiresAt?: string | null;
    };
    const payload = (await response.json()) as
      | RpcResult
      | RpcResult[]
      | Array<{ lombardo_submit_secret_cellar_attempt: RpcResult }>;
    const first = Array.isArray(payload) ? payload[0] : payload;
    const result = first && "lombardo_submit_secret_cellar_attempt" in first
      ? first.lombardo_submit_secret_cellar_attempt
      : first as RpcResult | undefined;
    if (!result) throw new SecretCellarStoreError("Runia no devolvió el resultado del intento.");
    return {
      status: result.status,
      result: result.result,
      couponCode: result.couponCode ?? undefined,
      couponExpiresAt: result.couponExpiresAt ?? undefined,
    };
  }

  async listAttempts(challengeId: string): Promise<SecretCellarAttempt[]> {
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "id,player_key,guest_contact_masked,selected_product_id,result,promotion_id,coupon_code,attempted_at",
      tenant_id: `eq.${tenantId}`,
      challenge_id: `eq.${challengeId}`,
      order: "attempted_at.desc",
      limit: "5000",
    });
    return (await this.rows<AttemptRow>(
      `secret_cellar_attempts?${search}`,
      "No pudimos cargar los intentos.",
    )).map((row) => ({
      id: String(row.id),
      playerLabel: row.guest_contact_masked ?? `CUENTA · ${row.player_key.slice(-8)}`,
      selectedProductId: row.selected_product_id,
      result: row.result,
      promotionId: row.promotion_id ?? undefined,
      couponCode: row.coupon_code ?? undefined,
      attemptedAt: row.attempted_at,
    }));
  }

  async countConsumedPromotions(promotionIds: string[]) {
    if (!promotionIds.length) return 0;
    const tenantId = await this.tenantId();
    const search = new URLSearchParams({
      select: "promotion_id",
      tenant_id: `eq.${tenantId}`,
      promotion_id: `in.(${promotionIds.join(",")})`,
      status: "eq.CONSUMED",
      limit: "5000",
    });
    return (await this.rows<{ promotion_id: string }>(
      `commerce_promotion_redemptions?${search}`,
      "No pudimos calcular la conversión.",
    )).length;
  }
}
