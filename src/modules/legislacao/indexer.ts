import * as cheerio from "cheerio";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import type {
  AdapterError,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { fetchWithRetry as coreFetchWithRetry } from "../../core/http/download";
import { normas } from "./catalog";
import { legislacaoErrors } from "./errors";
import type { DocumentoIndexado } from "./store";

const planaltoUserAgent =
  "Mozilla/5.0 (compatible; dados-publicos-mcp/0.1.0; +https://github.com/Licitei/dados-publicos-mcp)";

const titulo = "Legislacao brasileira (Planalto)";
const storage = "sqlite" as const;

export const legislacaoIndexAdapter: IndexAdapter & {
  buildDocumentos: typeof buildLegislacaoIndex;
} = {
  key: "legislacao",
  titulo,
  storage,
  requiresHeavyDownload: false,
  buildDocumentos: buildLegislacaoIndex,
  async build(): Promise<ResultType<BuildSummary, AdapterError>> {
    // Import dinamico para evitar ciclo de inicializacao com store.ts.
    const { recriarIndiceLocal } = await import("./store");
    const built = await recriarIndiceLocal();

    if (Result.isError(built)) return Result.err(built.error);

    return Result.ok({
      dominio: "legislacao",
      registros: built.value.normasIndexadas.length,
      atualizadoEm: built.value.atualizadoEm,
      caminho: built.value.caminho,
      detalhes: { normasIndexadas: built.value.normasIndexadas },
    });
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const { statusIndiceLocal } = await import("./store");
    const status = await statusIndiceLocal();

    if (Result.isError(status)) return Result.err(status.error);

    return Result.ok({
      key: "legislacao",
      titulo,
      storage,
      requiresHeavyDownload: false,
      existe: status.value.existe,
      atualizadoEm: status.value.atualizadoEm,
      registros: status.value.normasIndexadas.length || null,
      caminho: status.value.caminho,
    });
  },
};

async function buildLegislacaoIndex(): Promise<
  ResultType<DocumentoIndexado[], EvlogError>
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

async function fetchNorma(url: string): Promise<ResultType<string, EvlogError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await coreFetchWithRetry(url, {
        headers: {
          "user-agent": planaltoUserAgent,
          accept: "text/html,application/xhtml+xml",
        },
      });
      const buffer = await response.arrayBuffer();

      return decodePlanaltalto(buffer);
    },
    catch: (cause): EvlogError =>
      legislacaoErrors.FONTE_DOWNLOAD({ url, internal: { cause: String(cause) } }),
  });
}

function decodePlanaltalto(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
}

function parsePlanaltoHtml(
  html: string,
  url: string
): ResultType<string[], EvlogError> {
  return Result.try({
    try: () => htmlToParagraphs(html),
    catch: (cause): EvlogError =>
      legislacaoErrors.FONTE_PARSE({ url, internal: { cause: String(cause) } }),
  });
}

export function htmlToParagraphs(html: string): string[] {
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
