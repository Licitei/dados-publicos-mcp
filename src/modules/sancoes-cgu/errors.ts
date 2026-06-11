import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio sancoes-cgu (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "sancoes-cgu.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(sancoesCguErrors.FETCH({ url }));
 * Detalhes originais (cause de fetch/parse) vao em `internal: { cause }`.
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const sancoesCguErrors = defineErrorCatalog("sancoes-cgu", {
  FETCH: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar o snapshot de sancoes da CGU: ${url}`,
    why: "O CDN da CGU nao respondeu com um snapshot valido para este dataset.",
    fix: "Tente novamente mais tarde; o CDN publica um arquivo por data (YYYYMMDD).",
    tags: ["sancoes-cgu", "rede", "retryable"],
  },
  SNAPSHOT_AUSENTE: {
    status: 404,
    message: ({ dataset, dias }: { dataset: string; dias: number }) =>
      `Nenhum snapshot encontrado para ${dataset} nos ultimos ${dias} dias.`,
    why: "Nem todo dataset publica diariamente; o lookback nao alcancou um arquivo existente.",
    fix: "Aumente a janela de lookback ou tente novamente quando a CGU publicar.",
    tags: ["sancoes-cgu", "rede"],
  },
  PARSE: {
    status: 500,
    message: ({ dataset }: { dataset: string }) =>
      `Falha ao processar o zip de ${dataset}.`,
    why: "O zip baixado nao continha um CSV valido ou o parse do CSV falhou.",
    tags: ["sancoes-cgu", "parse"],
  },
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice de sancoes nao encontrado. Caminho esperado: ${path}`,
    why: "O banco SQLite do dominio sancoes-cgu ainda nao foi construido nesta maquina.",
    fix: 'Rode "bun run index" ou a ferramenta indexar_sancoes.',
    tags: ["sancoes-cgu", "indice"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de sancoes-cgu.",
    why: "Os argumentos recebidos nao passaram na validacao do schema da tool.",
    tags: ["sancoes-cgu", "input"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "sancoes-cgu": typeof sancoesCguErrors;
  }
}
