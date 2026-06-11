import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio receita-cnpj (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "receita-cnpj.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(receitaCnpjErrors.INDICE_AUSENTE({ path }));
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const receitaCnpjErrors = defineErrorCatalog("receita-cnpj", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice receita-cnpj nao encontrado. Rode o build (indexar) primeiro. Caminho esperado: ${path}`,
    why: "O banco SQLite da fonte receita-cnpj ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index receita-cnpj (download pesado da base do CNPJ).",
    tags: ["receita-cnpj", "indice"],
  },
  CNPJ_INVALIDO: {
    status: 400,
    message: ({ cnpj }: { cnpj: string }) =>
      `CNPJ invalido: ${cnpj}. Use 14 digitos (basico+ordem+dv).`,
    fix: "Informe os 14 digitos do CNPJ (com ou sem mascara).",
    tags: ["receita-cnpj", "validation"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de receita-cnpj.",
    tags: ["receita-cnpj", "validation"],
  },
  TOOL_DESCONHECIDA: {
    status: 404,
    message: ({ name }: { name: string }) =>
      `Ferramenta de receita-cnpj nao encontrada: ${name}`,
    tags: ["receita-cnpj", "tool"],
  },
  FETCH: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao acessar o share da Receita Federal: ${url}`,
    why: "O endpoint WebDAV/HTTP da RFB nao respondeu (rede, auth ou status fora de 2xx).",
    tags: ["receita-cnpj", "rede", "retryable"],
  },
  PARSE: {
    status: 500,
    message: ({ file }: { file: string }) =>
      `Falha ao indexar receita-cnpj: ${file}`,
    why: "A descompactacao, o parse dos CSVs ou a gravacao no SQLite falhou.",
    tags: ["receita-cnpj", "parse"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "receita-cnpj": typeof receitaCnpjErrors;
  }
}
