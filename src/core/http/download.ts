import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { httpErrors } from "./errors";

/** Canal de erro de transporte do core: EvlogError do catalogo `http`. */
export type HttpError = EvlogError;

type RetryOptions = {
  timeoutMs?: number;
  retries?: number;
};

const retryableStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504]);
const defaultTimeoutMs = 30_000;
const defaultRetries = 3;
const userAgent =
  "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)";

/**
 * fetch com timeout e retry exponencial para status retryable e erros de rede.
 * Retorna um Result: o canal de erro carrega o EvlogError do catalogo `http`,
 * construido INLINE no ponto de decisao (status fora de 2xx, timeout/abort ou
 * falha de rede). Componha com um guard `Result.isError` no chamador.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions
): Promise<ResultType<Response, HttpError>> {
  const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs;
  const retries = opts?.retries ?? defaultRetries;

  const attempt = async (
    n: number
  ): Promise<ResultType<Response, HttpError>> => {
    const attemptResult = await Result.tryPromise({
      try: () =>
        fetch(url, {
          ...init,
          headers: withDefaultHeaders(init?.headers),
          signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
        }),
      catch: (cause): EvlogError => {
        const name =
          typeof cause === "object" && cause !== null
            ? (cause as { name?: unknown }).name
            : undefined;
        // AbortController.abort() -> "AbortError"; AbortSignal.timeout() (o
        // caminho padrao de timeout) -> "TimeoutError". Ambos sinalizam que a
        // requisicao foi cancelada por exceder o prazo configurado.
        const aborted = name === "AbortError" || name === "TimeoutError";

        return aborted
          ? httpErrors.TIMEOUT({ url, timeoutMs, internal: { cause: String(cause) } })
          : httpErrors.REDE({ url, internal: { cause: String(cause) } });
      },
    });

    if (Result.isOk(attemptResult)) {
      const response = attemptResult.value;

      if (response.ok) return Result.ok(response);

      const statusError = httpErrors.STATUS({ url, status: response.status });

      if (!retryableStatusCodes.has(response.status) || n === retries) {
        return Result.err(statusError);
      }
    } else if (n === retries) {
      return attemptResult;
    }

    await Bun.sleep(Math.min(250 * 2 ** n, 3_000));

    return attempt(n + 1);
  };

  return attempt(0);
}

/** Baixa e faz o parse de JSON, devolvendo um Result. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions
): Promise<ResultType<T, HttpError>> {
  const fetched = await fetchWithRetry(
    url,
    { ...init, headers: withJsonHeaders(init?.headers) },
    opts
  );

  if (Result.isError(fetched)) return Result.err(fetched.error);

  const response = fetched.value;

  if (response.status === 204) return Result.ok(null as T);

  return Result.tryPromise({
    try: async () => {
      const text = await response.text();

      if (!text.trim()) return null as T;

      return JSON.parse(text) as T;
    },
    catch: (cause): EvlogError =>
      httpErrors.PARSE({ url, internal: { cause: String(cause) } }),
  });
}

/**
 * Baixa uma URL diretamente para um arquivo em disco. Bun.write consome o
 * corpo da Response em streaming, sem handle de arquivo manual.
 * onProgress recebe (bytesObtidos, bytesTotal) num unico tick terminal.
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts?: {
    onProgress?: (got: number, total: number) => void;
  }
): Promise<ResultType<string, HttpError>> {
  const fetched = await fetchWithRetry(url);

  if (Result.isError(fetched)) return Result.err(fetched.error);

  const response = fetched.value;

  return Result.tryPromise({
    try: async () => {
      const total = Number(response.headers.get("content-length") ?? 0);

      await mkdir(dirname(destPath), { recursive: true });
      await Bun.write(destPath, response);

      opts?.onProgress?.(total, total);

      return destPath;
    },
    catch: (cause): EvlogError =>
      httpErrors.PARSE({ url, internal: { cause: String(cause) } }),
  });
}

function withDefaultHeaders(headers: HeadersInit | undefined): HeadersInit {
  const result = new Headers(headers);

  if (!result.has("user-agent")) result.set("user-agent", userAgent);

  return result;
}

function withJsonHeaders(headers: HeadersInit | undefined): HeadersInit {
  const result = new Headers(headers);

  if (!result.has("accept")) result.set("accept", "application/json");

  return result;
}
