import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio camara-deputados (estilo
 * dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "camara-deputados.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(camaraErrors.INDICE_AUSENTE({ caminho }));
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const camaraErrors = defineErrorCatalog("camara-deputados", {
  DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar arquivo da Camara dos Deputados: ${url}`,
    why: "A fonte oficial (dadosabertos.camara.leg.br / camara.leg.br) nao respondeu, expirou ou retornou erro.",
    fix: "Verifique a conexao e tente novamente; o arquivo pode estar temporariamente indisponivel.",
    tags: ["camara-deputados", "rede", "retryable"],
  },
  INDICE_AUSENTE: {
    status: 404,
    message: ({ caminho }: { caminho: string }) =>
      `Banco da Camara nao encontrado. Rode a indexacao (indexar_camara) antes. Caminho esperado: ${caminho}`,
    why: "O banco SQLite do dominio camara-deputados ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index camara-deputados (ou a tool indexar_camara).",
    tags: ["camara-deputados", "indice"],
  },
  ENTRADA_INVALIDA: {
    status: 400,
    message: "Entrada invalida para ferramenta da Camara.",
    why: "Os argumentos da ferramenta nao passaram na validacao do schema.",
    fix: "Corrija os campos indicados em issues e tente novamente.",
    tags: ["camara-deputados", "entrada"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "camara-deputados": typeof camaraErrors;
  }
}
