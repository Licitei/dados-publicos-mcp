import ky from "ky";
import { Result, type Result as ResultType } from "better-result";
import { normas } from "./catalog";
import { causeMessage, type LegislacaoError, PlanaltoFetchError } from "./errors";
import { parsePlanaltoHtml } from "./parser";
import type { DocumentoIndexado } from "./store";

const http = ky.create({
  timeout: 30_000,
  retry: {
    limit: 3,
    methods: ["get"],
    statusCodes: [408, 413, 429, 500, 502, 503, 504],
    backoffLimit: 3_000,
  },
  headers: {
    "user-agent": "dados-publicos-mcp/0.1.0",
    accept: "text/html,application/xhtml+xml",
  },
});

export const legislacaoIndexAdapter = {
  name: "legislacao",
  build: buildLegislacaoIndex,
};

async function buildLegislacaoIndex(): Promise<
  ResultType<DocumentoIndexado[], LegislacaoError>
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
      const buffer = await http.get(url).arrayBuffer();

      return decodePlanaltalto(buffer);
    },
    catch: (cause) =>
      new PlanaltoFetchError({
        message: `Falha ao baixar fonte oficial do Planalto em ${url}: ${causeMessage(cause)}`,
        url,
      }),
  });
}

function decodePlanaltalto(buffer: ArrayBuffer) {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);

  if (!utf8.includes("�")) return utf8;

  return new TextDecoder("windows-1252", { fatal: false }).decode(buffer);
}
