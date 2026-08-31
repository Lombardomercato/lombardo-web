import type {
  ActiveCompetitorSlug,
  CompetitorCommercialObservation,
  EconomicScenario,
  MarketPosition,
  PriceSignal,
  ScenarioConclusion,
  ScenarioPrice,
} from "./types";

export const TOP_TEN_COMPETITOR_PRODUCTS = [
  { key: "coquena-malbec", label: "Coquena Malbec", required: ["coquena", "malbec"] },
  { key: "coquena-torrontes", label: "Coquena Torrontés", required: ["coquena", "torrontes"] },
  { key: "felino-malbec", label: "Felino Malbec", required: ["felino", "malbec"] },
  { key: "nicola-catena-bonarda", label: "Nicola Catena Bonarda", required: ["nicola", "catena", "bonarda"] },
  { key: "campari-750", label: "Campari 750", required: ["campari", "750"] },
  { key: "fernet-branca-750", label: "Fernet Branca 750", required: ["fernet", "branca", "750"] },
  { key: "fernet-branca-450", label: "Fernet Branca 450", required: ["fernet", "branca", "450"] },
  { key: "chandon-brut-nature", label: "Chandon Brut Nature", required: ["chandon", "brut", "nature", "750"] },
  { key: "skyy-750", label: "Skyy 750", required: ["skyy", "750"] },
  { key: "gin-spirito-blu", label: "Gin Spirito Blu", required: ["gin", "spirito", "blu"] },
] as const;

const SIGNAL_WEIGHTS: Record<PriceSignal, number> = {
  strong: 1,
  medium: 0.65,
  weak: 0.25,
  invalid: 0,
};

export function normalizedProductText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function productMatchesTopTen(productKey: string, value: string) {
  const definition = TOP_TEN_COMPETITOR_PRODUCTS.find((item) => item.key === productKey);
  if (!definition) return false;
  const normalized = ` ${normalizedProductText(value)} `;
  return definition.required.every((token) => normalized.includes(` ${token} `));
}

export function effectiveProductPrice(observation: CompetitorCommercialObservation) {
  return observation.promotionalPrice ?? observation.unitPrice ?? observation.listPrice;
}

export function classifyPriceSignal(input: {
  price?: number;
  stockStatus: CompetitorCommercialObservation["stockStatus"];
  cartAvailable?: boolean;
  checkoutType: CompetitorCommercialObservation["checkoutType"];
  checkoutConfidence: number;
  priceSource: CompetitorCommercialObservation["priceSource"];
}) : PriceSignal {
  if (!input.price || input.price <= 0 || input.stockStatus === "out_of_stock" || input.cartAvailable === false) {
    return "invalid";
  }
  if (
    input.stockStatus === "in_stock" &&
    input.cartAvailable === true &&
    input.checkoutType !== "none" &&
    input.checkoutConfidence >= 0.7
  ) return "strong";
  if (input.stockStatus === "in_stock") return input.priceSource === "tariff" ? "weak" : "medium";
  return "weak";
}

export function observationScenarioPrices(observation: CompetitorCommercialObservation) {
  const price = effectiveProductPrice(observation);
  const unavailable: ScenarioPrice = {
    signal: observation.priceSignal,
    executable: false,
    note: "Información insuficiente; no se estimó el costo faltante.",
  };
  if (!price || observation.priceSignal === "invalid") {
    const invalid = { ...unavailable, signal: "invalid" as const, note: "Precio no utilizable o producto sin stock." };
    return {
      product_price: invalid,
      pickup_total: invalid,
      delivery_small_basket: invalid,
      delivery_large_basket: invalid,
    };
  }
  const product: ScenarioPrice = {
    amount: price,
    signal: observation.priceSignal,
    executable: observation.executable,
    note: observation.paymentConditions ?? "Precio observado.",
  };
  const pickup: ScenarioPrice = observation.pickupCost === undefined
    ? unavailable
    : {
        amount: price + observation.pickupCost,
        signal: observation.priceSignal,
        executable: observation.executable,
        note: observation.pickupCost === 0 ? "Retiro sin costo confirmado." : "Incluye costo de retiro informado.",
      };
  const deliverySmall: ScenarioPrice = observation.deliveryCost === undefined
    ? unavailable
    : {
        amount: price + observation.deliveryCost,
        signal: observation.priceSignal,
        executable: observation.executable,
        note: observation.note ?? "Incluye costo de envío observado.",
      };
  const deliveryLarge: ScenarioPrice = observation.freeDeliveryThreshold === undefined
    ? unavailable
    : {
        amount: price,
        signal: observation.priceSignal,
        executable: observation.executable,
        note: `Envío sin costo desde $${observation.freeDeliveryThreshold.toLocaleString("es-AR")}.`,
      };
  return {
    product_price: product,
    pickup_total: pickup,
    delivery_small_basket: deliverySmall,
    delivery_large_basket: deliveryLarge,
  };
}

function weightedMarketReference(values: Array<{ amount: number; signal: PriceSignal; confidence: number }>) {
  const weighted = values
    .map((value) => ({ ...value, weight: SIGNAL_WEIGHTS[value.signal] * value.confidence }))
    .filter((value) => value.weight > 0);
  const total = weighted.reduce((sum, value) => sum + value.weight, 0);
  if (!total) return undefined;
  return weighted.reduce((sum, value) => sum + (value.amount * value.weight), 0) / total;
}

export function concludeScenario(input: {
  scenario: EconomicScenario;
  lombardoTotal?: number;
  observations: Array<{ observation: CompetitorCommercialObservation; scenario: ScenarioPrice }>;
}): ScenarioConclusion {
  const usable = input.observations.flatMap(({ observation, scenario }) =>
    scenario.amount === undefined || scenario.signal === "invalid"
      ? []
      : [{ amount: scenario.amount, signal: scenario.signal, confidence: observation.checkoutConfidence }]);
  const marketReference = weightedMarketReference(usable);
  let position: MarketPosition = "insufficient_data";
  if (input.lombardoTotal !== undefined && marketReference !== undefined) {
    const difference = ((input.lombardoTotal - marketReference) / marketReference) * 100;
    position = difference < -5 ? "cheaper" : difference > 5 ? "more_expensive" : "in_market";
  }
  return {
    scenario: input.scenario,
    lombardoTotal: input.lombardoTotal,
    marketReference,
    position,
    usableSignals: usable.length,
  };
}

export function buildScenarioMatrix(input: {
  lombardoPrice?: number;
  lombardoPickupCost: number;
  lombardoDeliveryCost?: number;
  observations: Partial<Record<ActiveCompetitorSlug, CompetitorCommercialObservation>>;
}) {
  const scenarioPrices = Object.fromEntries(
    Object.entries(input.observations).map(([slug, observation]) => [
      slug,
      observationScenarioPrices(observation),
    ]),
  ) as Partial<Record<ActiveCompetitorSlug, Record<EconomicScenario, ScenarioPrice>>>;
  const scenarios: EconomicScenario[] = [
    "product_price",
    "pickup_total",
    "delivery_small_basket",
    "delivery_large_basket",
  ];
  const conclusions = Object.fromEntries(scenarios.map((scenario) => {
    const lombardoTotal = input.lombardoPrice === undefined
      ? undefined
      : scenario === "product_price"
        ? input.lombardoPrice
        : scenario === "pickup_total"
          ? input.lombardoPrice + input.lombardoPickupCost
          : input.lombardoDeliveryCost === undefined
            ? undefined
            : input.lombardoPrice + input.lombardoDeliveryCost;
    const observations = Object.entries(input.observations).flatMap(([slug, observation]) => {
      const scenarioPrice = scenarioPrices[slug as ActiveCompetitorSlug]?.[scenario];
      return scenarioPrice ? [{ observation, scenario: scenarioPrice }] : [];
    });
    return [scenario, concludeScenario({ scenario, lombardoTotal, observations })];
  })) as Record<EconomicScenario, ScenarioConclusion>;
  return { scenarioPrices, conclusions };
}

export function pricingRecommendation(input: {
  lombardoPrice?: number;
  vinrosCost?: number;
  conclusion: ScenarioConclusion;
}) {
  if (!input.lombardoPrice) return "Sin precio Lombardo verificable; no se genera recomendación.";
  if (!input.conclusion.marketReference || input.conclusion.usableSignals === 0) {
    return "Sin señales suficientes; mantener revisión manual y no modificar el precio.";
  }
  const margin = input.vinrosCost && input.conclusion.marketReference > input.vinrosCost
    ? ((input.conclusion.marketReference - input.vinrosCost) / input.conclusion.marketReference) * 100
    : undefined;
  const suffix = !input.vinrosCost
    ? "Costo VINROS no disponible para validar margen."
    : input.conclusion.marketReference <= input.vinrosCost
      ? "La referencia queda en o debajo del costo VINROS; no es aprobable."
      : `Margen bruto al valor de mercado: ${margin?.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%.`;
  if (input.conclusion.position === "more_expensive") {
    return `Revisar contra la referencia ponderada; requiere aprobación humana. ${suffix}`;
  }
  if (input.conclusion.position === "cheaper") {
    return `Lombardo ya está por debajo de la referencia ponderada. ${suffix}`;
  }
  return `Lombardo está en mercado; no se recomienda cambio automático. ${suffix}`;
}
