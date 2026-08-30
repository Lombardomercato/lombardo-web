import "server-only";

import {
  parsePositanoCatalogPage,
  robotsAllowsProducts,
} from "../../competitors/positano-parser.ts";
import type { CompetitorScrapeResult } from "../../competitors/types.ts";

const POSITANO_ORIGIN = "https://www.positanovinos.com.ar";
const USER_AGENT = "LombardoCompetitorIntelligence/1.0 (+https://www.lombardomercato.com)";

export class CompetitorSourceError extends Error {
  readonly circuitBreaking: boolean;

  constructor(message: string, circuitBreaking = false) {
    super(message);
    this.circuitBreaking = circuitBreaking;
  }
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

function assertPositanoResponse(response: Response) {
  const url = new URL(response.url || POSITANO_ORIGIN);
  if (url.protocol !== "https:" || !["positanovinos.com.ar", "www.positanovinos.com.ar"].includes(url.hostname)) {
    throw new CompetitorSourceError("Positano redirigió fuera del origen permitido.", true);
  }
}

export class PositanoCatalogSource {
  private readonly fetcher: typeof fetch;
  private readonly crawlDelayMs: number;
  private readonly maximumPages: number;

  constructor(options: {
    fetcher?: typeof fetch;
    crawlDelayMs?: number;
    maximumPages?: number;
  } = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.crawlDelayMs = Math.min(Math.max(options.crawlDelayMs ?? 750, 250), 10_000);
    this.maximumPages = Math.min(Math.max(options.maximumPages ?? 12, 1), 24);
  }

  private async fetchText(path: string) {
    let response: Response;
    try {
      response = await this.fetcher(`${POSITANO_ORIGIN}${path}`, {
        headers: { Accept: "text/html,text/plain;q=0.9", "User-Agent": USER_AGENT },
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
    } catch {
      throw new CompetitorSourceError(`No se pudo leer ${path} dentro del tiempo permitido.`);
    }
    assertPositanoResponse(response);
    if (response.status === 429) {
      throw new CompetitorSourceError("Positano indicó rate limit; la corrida se detuvo sin reintentos.");
    }
    if (!response.ok) throw new CompetitorSourceError(`Positano respondió HTTP ${response.status} en ${path}.`);
    return response.text();
  }

  async scrape(): Promise<CompetitorScrapeResult> {
    const robots = await this.fetchText("/robots.txt");
    const robotsAllowed = robotsAllowsProducts(robots);
    if (!robotsAllowed) {
      throw new CompetitorSourceError("robots.txt no permite procesar /productos/.", true);
    }
    await wait(this.crawlDelayMs);

    const fetchedAt = new Date().toISOString();
    const firstHtml = await this.fetchText("/productos/");
    const first = parsePositanoCatalogPage(firstHtml, fetchedAt);
    if (first.structuralSignature.startsWith("missing-") || first.structuralSignature.startsWith("unbalanced-")) {
      throw new CompetitorSourceError("Cambió la estructura principal del catálogo de Positano.", true);
    }
    const products = [...first.products];
    let objectsDetected = first.objectsDetected;
    let pagesFetched = 1;
    let currentPage = first;
    while (currentPage.pagesDiscovered > pagesFetched) {
      const page = pagesFetched + 1;
      if (page > this.maximumPages) {
        throw new CompetitorSourceError(
          `El catálogo supera el límite seguro de ${this.maximumPages} páginas.`,
          true,
        );
      }
      await wait(this.crawlDelayMs);
      const html = await this.fetchText(`/productos/page/${page}/`);
      const parsed = parsePositanoCatalogPage(html, fetchedAt);
      if (parsed.structuralSignature.startsWith("missing-") || parsed.structuralSignature.startsWith("unbalanced-")) {
        throw new CompetitorSourceError(`Cambió la estructura del catálogo en la página ${page}.`, true);
      }
      products.push(...parsed.products);
      objectsDetected += parsed.objectsDetected;
      pagesFetched = page;
      currentPage = parsed;
    }

    const unique = [...new Map(products.map((product) => [product.externalId, product])).values()];
    const parseRatio = objectsDetected ? unique.length / objectsDetected : 0;
    if (objectsDetected < 10 || unique.length < 10 || parseRatio < 0.8) {
      throw new CompetitorSourceError(
        `El parser sólo recuperó ${unique.length}/${objectsDetected} productos detectados.`,
        true,
      );
    }
    return {
      products: unique,
      pagesFetched,
      pagesDiscovered: pagesFetched,
      objectsDetected,
      structuralSignature: first.structuralSignature,
      robotsAllowed,
    };
  }
}
