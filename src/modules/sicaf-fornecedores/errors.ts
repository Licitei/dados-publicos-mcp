import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio SICAF / Compras.gov.br - Cadastro de
 * Fornecedores (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "sicaf-fornecedores.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(sicafErrors.INDICE_AUSENTE({ path }));
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const sicafErrors = defineErrorCatalog("sicaf-fornecedores", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice SICAF nao encontrado. Rode a ferramenta indexar_sicaf_fornecedores. Caminho esperado: ${path}`,
    why: "O banco SQLite de fornecedores ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index sicaf-fornecedores (ou a tool indexar_sicaf_fornecedores).",
    tags: ["sicaf-fornecedores", "indice"],
  },
  FONTE_DOWNLOAD: {
    status: 502,
    message: ({ pagina, ativo }: { pagina: number; ativo: boolean }) =>
      `Falha ao baixar pagina ${pagina} (ativo=${ativo}) do SICAF.`,
    why: "A consulta paginada ao Compras.gov.br nao retornou uma resposta valida.",
    tags: ["sicaf-fornecedores", "rede", "retryable"],
  },
  FONTE_INVALIDA: {
    status: 502,
    message: ({ pagina, ativo }: { pagina: number; ativo: boolean }) =>
      `Resposta inesperada da API SICAF na pagina ${pagina} (ativo=${ativo}).`,
    why: "O envelope retornado pela API nao contem o array `resultado` esperado.",
    tags: ["sicaf-fornecedores", "parse"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta de SICAF fornecedores.",
    fix: "Revise os campos enviados; veja `issues` para os detalhes de validacao.",
    tags: ["sicaf-fornecedores", "input"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "sicaf-fornecedores": typeof sicafErrors;
  }
}
