import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros de transporte HTTP do core (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "http.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(httpErrors.STATUS({ url, status }));
 * Erros de rede/timeout passam o detalhe original em `internal: { cause }`.
 */
export const httpErrors = defineErrorCatalog("http", {
  STATUS: {
    status: 502,
    message: ({ url, status }: { url: string; status: number }) =>
      `Falha ao baixar ${url}: HTTP ${status}`,
    why: "O servidor remoto respondeu com um status fora da faixa 2xx.",
    tags: ["http", "transport"],
  },
  REDE: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar ${url}: erro de rede`,
    why: "A requisicao nao chegou a obter uma resposta valida do servidor remoto.",
    tags: ["http", "transport", "retryable"],
  },
  TIMEOUT: {
    status: 504,
    message: ({ url, timeoutMs }: { url: string; timeoutMs: number }) =>
      `Falha ao baixar ${url}: timeout depois de ${timeoutMs}ms`,
    why: "O servidor remoto nao respondeu dentro do tempo limite configurado.",
    tags: ["http", "transport", "retryable"],
  },
  PARSE: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao interpretar a resposta de ${url}.`,
    why: "O corpo da resposta nao pode ser lido ou decodificado.",
    tags: ["http", "parse"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    http: typeof httpErrors;
  }
}
