import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { dadosPublicosErrors } from "./errors";

type FetchJsonInput = {
  baseUrl: string;
  path: string;
  params?: Record<string, unknown>;
  timeoutMs?: number;
  cacheTtlMs?: number;
};

type CacheEntry = {
  expiresAt: number;
  value: unknown;
};

const cache = new Map<string, CacheEntry>();
const retryableStatusCodes = new Set([408, 429, 500, 502, 503, 504]);
const defaultTimeoutMs = 27_000;
const userAgent =
  "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)";

export const PNCP_CONSULTA_BASE_URL = "https://pncp.gov.br/api/consulta/v1";
export const PNCP_BASE_URL = "https://pncp.gov.br/api/pncp/v1";
export const BRASIL_API_BASE_URL = "https://brasilapi.com.br";
export const MINHA_RECEITA_BASE_URL = "https://minhareceita.org";

export async function fetchPublicJson(
  input: FetchJsonInput,
): Promise<ResultType<unknown, EvlogError>> {
  const url = buildUrl(input.baseUrl, input.path, input.params);
  const cacheKey = url.toString();
  const cached = cache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return Result.ok(cached.value);
  }

  const fetched = await fetchWithRetry(
    url,
    input.timeoutMs ?? defaultTimeoutMs,
  );

  if (Result.isError(fetched)) return fetched;

  if (input.cacheTtlMs && input.cacheTtlMs > 0) {
    cache.set(cacheKey, {
      expiresAt: Date.now() + input.cacheTtlMs,
      value: fetched.value,
    });
  }

  return Result.ok(fetched.value);
}

function buildUrl(
  baseUrl: string,
  path: string,
  params?: Record<string, unknown>,
) {
  const url = new URL(path, `${baseUrl}/`);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }

  return url;
}

/**
 * Pagina/baixa um JSON da fonte publica com ate 3 tentativas em statuses
 * retryaveis (408/429/5xx) e backoff exponencial. Em vez de lancar, retorna o
 * EvlogError do catalogo no canal de erro do Result, construido INLINE no ponto
 * de decisao (status fora de 2xx, timeout, falha de rede ou parse invalido).
 */
async function fetchWithRetry(
  url: URL,
  timeoutMs: number,
): Promise<ResultType<unknown, EvlogError>> {
  const target = url.toString();

  const attempt = async (
    n: number,
  ): Promise<ResultType<unknown, EvlogError>> => {
    const attempted = await Result.tryPromise({
      try: () =>
        fetch(url, {
          headers: {
            accept: "application/json",
            "user-agent": userAgent,
          },
          signal: AbortSignal.timeout(timeoutMs),
        }),
      catch: (cause): EvlogError =>
        isAbort(cause)
          ? dadosPublicosErrors.FETCH_TIMEOUT({
              url: target,
              timeoutMs,
              internal: { cause: String(cause) },
            })
          : dadosPublicosErrors.FETCH_REDE({
              url: target,
              internal: { cause: String(cause) },
            }),
    });

    if (Result.isOk(attempted)) {
      const response = attempted.value;

      if (response.ok) {
        return parseBody(response, target);
      }

      const detailRead = await Result.tryPromise({
        try: () => response.text(),
        catch: () => response.statusText,
      });
      const detail = Result.isOk(detailRead)
        ? detailRead.value
        : response.statusText;
      const statusError = dadosPublicosErrors.FETCH_STATUS({
        url: target,
        status: response.status,
        internal: { detail: detail.trim() || response.statusText },
      });

      if (!retryableStatusCodes.has(response.status) || n === 2) {
        return Result.err(statusError);
      }
    } else if (n === 2) {
      return attempted;
    }

    await Bun.sleep(Math.min(500 * 2 ** n, 3_000));

    return attempt(n + 1);
  };

  return attempt(0);
}

async function parseBody(
  response: Response,
  url: string,
): Promise<ResultType<unknown, EvlogError>> {
  if (response.status === 204) return Result.ok(null);

  return Result.tryPromise({
    try: async () => {
      const text = await response.text();

      if (!text.trim()) return null;

      return JSON.parse(text) as unknown;
    },
    catch: (cause): EvlogError =>
      dadosPublicosErrors.FETCH_STATUS({
        url,
        status: response.status,
        internal: { cause: String(cause) },
      }),
  });
}

function isAbort(cause: unknown): boolean {
  if (!cause || typeof cause !== "object" || !("name" in cause)) return false;

  const name = (cause as { name?: unknown }).name;

  return name === "AbortError" || name === "TimeoutError";
}
