import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio CATMAT/CATSER (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "catmat-catser.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return Result.err(catmatCatserErrors.INDICE_AUSENTE({ path }));
 * Erros de rede/fetch passam o detalhe original em `internal: { cause }`.
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const catmatCatserErrors = defineErrorCatalog("catmat-catser", {
  FETCH: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao paginar a API Compras.gov.br: ${url}`,
    why: "A requisicao paginada a fonte CATMAT/CATSER nao obteve uma resposta valida.",
    fix: "Tente novamente; o Azure Front Door pode throttlar requisicoes em rajada.",
    tags: ["catmat-catser", "rede", "retryable"],
  },
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice local CATMAT/CATSER nao encontrado. Caminho esperado: ${path}`,
    why: "O banco SQLite do dominio CATMAT/CATSER ainda nao foi construido nesta maquina.",
    fix: 'Rode "bun run index" ou a ferramenta indexar_catmat_catser.',
    tags: ["catmat-catser", "indice"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta CATMAT/CATSER.",
    why: "Os argumentos recebidos nao passaram na validacao do schema da tool.",
    tags: ["catmat-catser", "validacao"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "catmat-catser": typeof catmatCatserErrors;
  }
}
