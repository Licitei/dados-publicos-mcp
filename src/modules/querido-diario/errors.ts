import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio querido-diario (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "querido-diario.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(queridoDiarioErrors.INDICE_AUSENTE());
 *   return Result.err(queridoDiarioErrors.CNPJ_INVALIDO({ cnpj }));
 * Detalhe original de IO/rede vai em `internal: { cause: String(cause) }`.
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const queridoDiarioErrors = defineErrorCatalog("querido-diario", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice do Querido Diario nao encontrado. Caminho esperado: ${path}`,
    why: "O banco SQLite do dominio querido-diario ainda nao foi construido nesta maquina.",
    fix: "Rode o build pesado (requiresHeavyDownload) para baixar e indexar os diarios oficiais municipais.",
    tags: ["querido-diario", "indice"],
  },
  CNPJ_INVALIDO: {
    status: 400,
    message: ({ cnpj }: { cnpj: string }) =>
      `CNPJ invalido: ${cnpj}. Use 14 digitos.`,
    fix: "Informe o CNPJ com 14 digitos (com ou sem mascara).",
    tags: ["querido-diario", "entrada"],
  },
  BUSCA: {
    status: 500,
    message: "Falha ao consultar o indice do Querido Diario.",
    tags: ["querido-diario", "io"],
  },
  FONTE_DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar a fonte oficial do Querido Diario: ${url}`,
    tags: ["querido-diario", "rede", "retryable"],
  },
  FONTE_PARSE: {
    status: 500,
    message: ({ url }: { url: string }) =>
      `Falha ao descompactar/parsear o agregado do Querido Diario: ${url}`,
    tags: ["querido-diario", "parse"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de querido-diario.",
    fix: "Confira os campos obrigatorios e formatos (uf com 2 letras, datas aaaa-mm-dd).",
    tags: ["querido-diario", "entrada"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "querido-diario": typeof queridoDiarioErrors;
  }
}
