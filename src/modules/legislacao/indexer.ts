import * as cheerio from "cheerio";
import { Result, TaggedError, type Result as ResultType } from "better-result";
import { normas } from "./catalog";
import type { DocumentoIndexado } from "./store";

export class PlanaltoFetchError extends TaggedError("PlanaltoFetchError")<{
  message: string;
  url: string;
}>() {}

export class PlanaltoParseError extends TaggedError("PlanaltoParseError")<{
  message: string;
  url: string;
}>() {}

export type PlanaltoIndexError = PlanaltoFetchError | PlanaltoParseError;

const retryableStatusCodes = new Set([408, 413, 429, 500, 502, 503, 504]);

export const legislacaoIndexAdapter = {
  name: "legislacao",
  build: buildLegislacaoIndex,
};

async function buildLegislacaoIndex(): Promise<
  ResultType<DocumentoIndexado[], PlanaltoIndexError>
> {
  const documentos: DocumentoIndexado[] = [];

  for (const norma of normas) {
    const fetched = await fetchNorma(norma.url);

    if (Result.isError(fetched)) return fetched;

    const parsed = parsePlanaltoHtml(fetched.value, norma.url);

    if (Result.isError(parsed)) return parsed;

    documentos.push({
      norma,
      paragrafos: parsed.value,
    });
  }

  return Result.ok(documentos);
}

async function fetchNorma(
  url: string
): Promise<ResultType<string, PlanaltoFetchError>> {
  return Result.tryPromise({
    try: async () => {
      const buffer = await fetchWithRetry(url);

      return decodePlanaltalto(buffer);
    },
    catch: (cause) =>
      new PlanaltoFetchError({
        message: `Falha ao baixar fonte oficial do Planalto em ${url}: ${causeMessage(cause)}`,
        url,
      }),
  });
}

async function fetchWithRetry(url: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        headers: {
          "user-agent": "dados-publicos-mcp/0.1.0",
          accept: "text/html,application/xhtml+xml",
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok) return response.arrayBuffer();

      const message = `HTTP ${response.status} ${response.statusText}`.trim();

      if (!retryableStatusCodes.has(response.status) || attempt === 3) {
        throw new Error(message);
      }

      lastError = new Error(message);
    } catch (error) {
      if (attempt === 3) throw error;

      lastError = error;
    }

    await sleep(Math.min(250 * 2 ** attempt, 3_000));
  }

  throw lastError;
}

function decodePlanaltalto(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
}

function parsePlanaltoHtml(
  html: string,
  url: string
): ResultType<string[], PlanaltoParseError> {
  return Result.try({
    try: () => htmlToParagraphs(html),
    catch: (cause) =>
      new PlanaltoParseError({
        message: `Falha ao parsear HTML do Planalto em ${url}: ${causeMessage(cause)}`,
        url,
      }),
  });
}

export function htmlToParagraphs(html: string) {
  const $ = cheerio.load(html);

  $("script, style").remove();

  const paragraphText = $("p, li, h1, h2, h3, h4, h5, h6")
    .toArray()
    .map((element) => $(element).text())
    .join("\n");
  const text = paragraphText || $("body").text() || $.root().text();

  return text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function causeMessage(cause: unknown) {
  if (typeof cause === "string") return cause;

  return String(cause);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
