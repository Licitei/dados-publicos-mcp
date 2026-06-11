import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio legislacao (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "legislacao.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(legislacaoErrors.INDICE_AUSENTE());
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const legislacaoErrors = defineErrorCatalog("legislacao", {
  INDICE_AUSENTE: {
    status: 404,
    message: "Indice local de legislacao nao encontrado.",
    why: "O banco SQLite do dominio legislacao ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index legislacao (ou a tool indexar_legislacao).",
    tags: ["legislacao", "indice"],
  },
  NORMA_NAO_ENCONTRADA: {
    status: 404,
    message: ({ norma }: { norma: string }) =>
      `Norma nao encontrada no catalogo: ${norma}`,
    fix: "Use listar_normas para ver os ids, titulos e apelidos disponiveis.",
    tags: ["legislacao", "catalogo"],
  },
  NORMA_NAO_INDEXADA: {
    status: 409,
    message: ({ norma }: { norma: string }) =>
      `Norma "${norma}" existe no catalogo mas ainda nao foi indexada.`,
    fix: "Reconstrua o indice com index legislacao.",
    tags: ["legislacao", "indice"],
  },
  LEITURA: {
    status: 500,
    message: "Falha ao ler o indice local de legislacao.",
    tags: ["legislacao", "io", "retryable"],
  },
  ESCRITA: {
    status: 500,
    message: "Falha ao gravar o indice local de legislacao.",
    tags: ["legislacao", "io"],
  },
  BUSCA: {
    status: 500,
    message: "Falha ao consultar o indice de legislacao.",
    tags: ["legislacao", "io"],
  },
  FONTE_DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar a fonte oficial do Planalto: ${url}`,
    tags: ["legislacao", "rede", "retryable"],
  },
  FONTE_PARSE: {
    status: 500,
    message: ({ url }: { url: string }) =>
      `Falha ao interpretar o HTML do Planalto: ${url}`,
    tags: ["legislacao", "parse"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de legislacao.",
    why: "Os argumentos recebidos nao casaram com o schema esperado da ferramenta.",
    tags: ["legislacao", "validation"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    legislacao: typeof legislacaoErrors;
  }
}
