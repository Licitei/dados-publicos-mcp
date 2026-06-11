import { mkdir, open, stat } from "node:fs/promises";
import { dirname } from "node:path";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { httpErrors } from "./errors";

/**
 * Canal de erro de transporte do core.
 *
 * Alvo declarativo: EvlogError do catalogo `http` (estilo dfe-kit/evlog).
 * Alias mantido para os modulos ainda nao convertidos que importam o tipo.
 */
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
 * Rejeita (Promise.reject) com um EvlogError do catalogo `http` quando esgota
 * as tentativas, no estilo do codigo existente. Use Result.tryPromise para
 * capturar.
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions
): Promise<Response> {
  const timeoutMs = opts?.timeoutMs ?? defaultTimeoutMs;
  const retries = opts?.retries ?? defaultRetries;
  let lastError: EvlogError = httpErrors.REDE({ url });

  for (let attempt = 0; attempt <= retries; attempt++) {
    const attemptResult = await Result.tryPromise({
      try: () =>
        fetch(url, {
          ...init,
          headers: withDefaultHeaders(init?.headers),
          signal: init?.signal ?? AbortSignal.timeout(timeoutMs),
        }),
      catch: (cause): EvlogError => toTransportError(cause, url, timeoutMs),
    });

    if (Result.isOk(attemptResult)) {
      const response = attemptResult.value;

      if (response.ok) return response;

      const statusError = httpErrors.STATUS({
        url,
        status: response.status,
      });

      if (!retryableStatusCodes.has(response.status) || attempt === retries) {
        return Promise.reject(statusError);
      }

      lastError = statusError;
    } else {
      if (attempt === retries) return Promise.reject(attemptResult.error);

      lastError = attemptResult.error;
    }

    await sleep(Math.min(250 * 2 ** attempt, 3_000));
  }

  return Promise.reject(lastError);
}

/** Baixa e faz o parse de JSON, devolvendo um Result. */
export async function fetchJson<T = unknown>(
  url: string,
  init?: RequestInit,
  opts?: RetryOptions
): Promise<ResultType<T, HttpError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetchWithRetry(
        url,
        { ...init, headers: withJsonHeaders(init?.headers) },
        opts
      );

      if (response.status === 204) return null as T;

      const text = await response.text();

      if (!text.trim()) return null as T;

      return JSON.parse(text) as T;
    },
    catch: (cause): EvlogError => toTransportError(cause, url, timeoutOf(opts)),
  });
}

/**
 * Baixa uma URL diretamente para um arquivo em disco (streaming).
 * Quando opts.resume e true e ja existe um arquivo parcial, usa Range/206
 * para continuar de onde parou. onProgress recebe (bytesObtidos, bytesTotal).
 */
export async function downloadToFile(
  url: string,
  destPath: string,
  opts?: {
    resume?: boolean;
    onProgress?: (got: number, total: number) => void;
  }
): Promise<ResultType<string, HttpError>> {
  return Result.tryPromise({
    try: async () => {
      await mkdir(dirname(destPath), { recursive: true });

      let existing = 0;

      if (opts?.resume) {
        existing = await fileSize(destPath);
      }

      const headers: Record<string, string> = {};

      if (existing > 0) headers.range = `bytes=${existing}-`;

      const response = await fetchWithRetry(url, { headers });
      const append = response.status === 206 && existing > 0;
      // 206 confirma Range; 200 ignora e baixa do zero.
      const startBytes = append ? existing : 0;
      const contentLength = Number(response.headers.get("content-length") ?? 0);
      const total = startBytes + (Number.isFinite(contentLength) ? contentLength : 0);

      const handle = await open(destPath, append ? "a" : "w");

      try {
        let got = startBytes;
        const body = response.body;

        if (!body) {
          const buffer = new Uint8Array(await response.arrayBuffer());

          await handle.write(buffer);
          got += buffer.byteLength;
          opts?.onProgress?.(got, Math.max(total, got));
        } else {
          const reader = body.getReader();

          while (true) {
            const { done, value } = await reader.read();

            if (done) break;
            if (!value) continue;

            await handle.write(value);
            got += value.byteLength;
            opts?.onProgress?.(got, Math.max(total, got));
          }
        }
      } finally {
        await handle.close();
      }

      return destPath;
    },
    catch: (cause): EvlogError => toTransportError(cause, url, defaultTimeoutMs),
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

function timeoutOf(opts?: RetryOptions): number {
  return opts?.timeoutMs ?? defaultTimeoutMs;
}

async function fileSize(path: string): Promise<number> {
  const info = await Result.tryPromise({
    try: () => stat(path),
    catch: (cause): EvlogError =>
      httpErrors.PARSE({ url: path, internal: { cause: String(cause) } }),
  });

  if (Result.isError(info)) return 0;

  return info.value.size;
}

/**
 * Mapeia uma causa arbitraria de fetch (rede, abort/timeout, ou um EvlogError
 * ja construido em uma tentativa anterior) para o EvlogError do catalogo `http`.
 */
function toTransportError(
  cause: unknown,
  url: string,
  timeoutMs: number
): EvlogError {
  if (isHttpEvlogError(cause)) return cause;

  const aborted =
    typeof cause === "object" &&
    cause !== null &&
    "name" in cause &&
    (cause as { name?: unknown }).name === "AbortError";

  if (aborted) {
    return httpErrors.TIMEOUT({
      url,
      timeoutMs,
      internal: { cause: String(cause) },
    });
  }

  return httpErrors.REDE({ url, internal: { cause: causeMessage(cause) } });
}

/** Reconhece um EvlogError ja pertencente ao catalogo `http` pela code. */
function isHttpEvlogError(cause: unknown): cause is EvlogError {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    typeof (cause as { code?: unknown }).code === "string" &&
    (cause as { code: string }).code.startsWith("http.")
  );
}

function causeMessage(cause: unknown): string {
  if (typeof cause === "object" && cause !== null && "message" in cause) {
    const message = (cause as { message?: unknown }).message;

    if (typeof message === "string") return message;
  }

  if (typeof cause === "string") return cause;

  return String(cause);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
