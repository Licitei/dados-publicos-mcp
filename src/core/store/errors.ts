import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros de persistencia local do core (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "store.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return Result.err(storeErrors.LEITURA({ path }));
 * O detalhe original do IO vai em `internal: { cause }`.
 */
export const storeErrors = defineErrorCatalog("store", {
  LEITURA: {
    status: 500,
    message: ({ path }: { path: string }) => `Falha ao ler ${path}.`,
    why: "A leitura do arquivo local de indice falhou (IO ou permissao).",
    tags: ["store", "io", "retryable"],
  },
  ESCRITA: {
    status: 500,
    message: ({ path }: { path: string }) => `Falha ao salvar ${path}.`,
    why: "A gravacao do arquivo local de indice falhou (IO ou permissao).",
    tags: ["store", "io"],
  },
  CONTEUDO_INVALIDO: {
    status: 500,
    message: ({ path, detalhe }: { path: string; detalhe: string }) =>
      `Conteudo invalido em ${path}: ${detalhe}`,
    why: "O arquivo existe mas nao casa com o schema esperado do dominio.",
    fix: "Reconstrua o indice do dominio.",
    tags: ["store", "validation"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    store: typeof storeErrors;
  }
}
