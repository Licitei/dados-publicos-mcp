import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio dados-publicos (estilo dfe-kit/evlog).
 *
 * Cobre os DOIS conjuntos da pasta:
 *   (a) modulo ONLINE (client.ts/service.ts/utils.ts): fetch ao PNCP/BrasilAPI/
 *       MinhaReceita e validacao de entrada (numeroControlePNCP, datas, trio).
 *   (b) indice OFFLINE pncp-* (pncp-service/pncp-indexer): leitura do SQLite e
 *       harvest da API de Consulta v1.
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "dados-publicos.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(dadosPublicosErrors.ENTRADA_INVALIDA({ detalhe }));
 *   return Result.err(dadosPublicosErrors.INDICE_AUSENTE({ path }));
 * O detalhe original de rede/IO vai em `internal: { cause }`.
 * Invariantes (bug/estado impossivel) usam panic() do better-result.
 */
export const dadosPublicosErrors = defineErrorCatalog("dados-publicos", {
  // ---- Online: fetch a fontes publicas ----
  FETCH_STATUS: {
    status: 502,
    message: ({ url, status }: { url: string; status: number }) =>
      `Falha ao consultar dado publico: HTTP ${status} em ${url}`,
    why: "A fonte publica (PNCP/BrasilAPI/MinhaReceita) respondeu com status fora da faixa 2xx.",
    tags: ["dados-publicos", "rede"],
  },
  FETCH_TIMEOUT: {
    status: 504,
    message: ({ url, timeoutMs }: { url: string; timeoutMs: number }) =>
      `Timeout ao consultar dado publico depois de ${timeoutMs}ms: ${url}`,
    why: "A fonte publica nao respondeu dentro do tempo limite configurado.",
    tags: ["dados-publicos", "rede", "retryable"],
  },
  FETCH_REDE: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao consultar dado publico: erro de rede em ${url}`,
    why: "A requisicao nao chegou a obter uma resposta valida da fonte publica.",
    tags: ["dados-publicos", "rede", "retryable"],
  },

  // ---- Online: validacao de entrada ----
  ENTRADA_INVALIDA: {
    status: 400,
    message: ({ detalhe }: { detalhe: string }) =>
      `Entrada invalida para consulta de dados publicos: ${detalhe}`,
    fix: "Reveja os parametros enviados a ferramenta.",
    tags: ["dados-publicos", "validation"],
  },
  NUMERO_CONTROLE_INVALIDO: {
    status: 400,
    message: ({ valor }: { valor: string }) =>
      `numeroControlePNCP invalido: ${valor}. Formato esperado: 00000000000000-0-000000/2026.`,
    tags: ["dados-publicos", "validation"],
  },
  IDENTIFICADOR_AUSENTE: {
    status: 400,
    message: "Informe numeroControlePNCP ou o trio orgaoCnpj, ano e sequencial.",
    tags: ["dados-publicos", "validation"],
  },
  DATA_INVALIDA: {
    status: 400,
    message: ({ campo }: { campo: string }) =>
      `${campo} deve estar no formato YYYYMMDD.`,
    tags: ["dados-publicos", "validation"],
  },

  // ---- Offline: indice SQLite do PNCP ----
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice offline do PNCP nao encontrado em ${path}.`,
    why: "O indice offline (pncp-bulk) ainda nao foi construido nesta maquina.",
    fix: "Rode a indexacao (build) primeiro: index pncp-bulk.",
    tags: ["dados-publicos", "indice"],
  },
  INDICE_LEITURA: {
    status: 500,
    message: ({ path }: { path: string }) =>
      `Falha ao abrir/ler o indice offline do PNCP em ${path}.`,
    tags: ["dados-publicos", "io", "retryable"],
  },

  // ---- Offline: harvest da API de Consulta v1 ----
  HARVEST_FALHOU: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao harvestar a API de Consulta v1 do PNCP: ${url}`,
    why: "Uma pagina da API de Consulta v1 falhou durante o harvest offline.",
    tags: ["dados-publicos", "rede", "harvest", "retryable"],
  },
  STATUS_LEITURA: {
    status: 500,
    message: "Falha ao ler o status do indice offline do PNCP.",
    tags: ["dados-publicos", "io"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "dados-publicos": typeof dadosPublicosErrors;
  }
}
