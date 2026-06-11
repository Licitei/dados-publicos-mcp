import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio CNAE (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "cnae.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(cnaeErrors.INDICE_AUSENTE({ path }));
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const cnaeErrors = defineErrorCatalog("cnae", {
  PARSE: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Resposta inesperada da API CNAE (esperado array de subclasses) em ${url}.`,
    why: "O JSON devolvido pela API v2 do IBGE nao casou com a forma esperada de subclasses com hierarquia aninhada.",
    tags: ["cnae", "parse"],
  },
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice CNAE local nao encontrado. Caminho esperado: ${path}`,
    why: "O indice JSON do dominio CNAE ainda nao foi construido nesta maquina.",
    fix: "Rode a ferramenta indexar_cnae (baixa ~3,6 MB do IBGE).",
    tags: ["cnae", "indice"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de CNAE.",
    why: "Os argumentos recebidos nao casaram com o schema esperado da ferramenta.",
    tags: ["cnae", "validation"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    cnae: typeof cnaeErrors;
  }
}
