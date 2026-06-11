import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio tse-eleitoral (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "tse-eleitoral.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(tseEleitoralErrors.INDICE_AUSENTE({ caminho }));
 * O detalhe original (causa de IO/parse) vai em `internal: { cause }`.
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const tseEleitoralErrors = defineErrorCatalog("tse-eleitoral", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ caminho }: { caminho: string }) =>
      `Indice TSE nao encontrado. Rode o build (indexar) da fonte "tse-eleitoral" - e um download pesado (prestacao 2024 ~1,18 GB). Caminho esperado: ${caminho}`,
    why: "O banco SQLite do dominio tse-eleitoral ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index tse-eleitoral (ou a tool de indexacao).",
    tags: ["tse-eleitoral", "indice"],
  },
  DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar dados do TSE em ${url}`,
    why: "A fonte oficial (CDN do TSE) nao respondeu com os dados esperados.",
    tags: ["tse-eleitoral", "rede", "retryable"],
  },
  PROCESSAMENTO: {
    status: 500,
    message: ({ tipo, ano }: { tipo: string; ano: number }) =>
      `Falha ao processar ${tipo} ${ano} (descompactacao/parse do CSV do TSE).`,
    why: "O zip baixado nao pode ser descompactado ou os CSVs nao puderam ser interpretados.",
    tags: ["tse-eleitoral", "parse"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta do TSE eleitoral.",
    fix: "Confira os parametros da tool (termo/cpf/sqCandidato/ano/limite).",
    tags: ["tse-eleitoral", "input"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "tse-eleitoral": typeof tseEleitoralErrors;
  }
}
