import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio ibge-localidades (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "ibge-localidades.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(ibgeLocalidadesErrors.INDICE_AUSENTE());
 * Para invariantes (bug/estado impossivel) use panic() do better-result.
 */
export const ibgeLocalidadesErrors = defineErrorCatalog("ibge-localidades", {
  FONTE_DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar municipios do IBGE: ${url}`,
    why: "A requisicao ao endpoint /municipios do IBGE nao retornou uma resposta valida.",
    tags: ["ibge-localidades", "rede", "retryable"],
  },
  FONTE_PARSE: {
    status: 500,
    message: ({ url }: { url: string }) =>
      `Falha ao interpretar o payload de municipios do IBGE: ${url}`,
    why: "O corpo retornado pela API do IBGE nao casa com o schema esperado de municipios.",
    tags: ["ibge-localidades", "parse"],
  },
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice IBGE Localidades nao encontrado. Caminho esperado: ${path}`,
    why: "O indice local de localidades ainda nao foi construido nesta maquina.",
    fix: 'Rode "bun run index" ou a ferramenta indexar_ibge_localidades.',
    tags: ["ibge-localidades", "indice"],
  },
  MUNICIPIO_NAO_ENCONTRADO: {
    status: 404,
    message: ({ termo, uf }: { termo: string; uf?: string }) =>
      `Municipio nao encontrado: ${termo}${uf ? `/${uf}` : ""}`,
    fix: "Confira o nome do municipio ou use validar_uf para a sigla correta.",
    tags: ["ibge-localidades", "busca"],
  },
  CODIGO_NAO_ENCONTRADO: {
    status: 404,
    message: ({
      codigo,
      normalizado,
    }: {
      codigo: string;
      normalizado: string;
    }) =>
      `Codigo IBGE nao encontrado: ${codigo} (normalizado: ${normalizado}). O codigo de municipio tem 7 digitos.`,
    fix: "Use resolver_municipio para descobrir o codigo IBGE de 7 digitos a partir do nome.",
    tags: ["ibge-localidades", "busca"],
  },
  UF_INVALIDA: {
    status: 422,
    message: ({ uf }: { uf: string }) =>
      `UF invalida: ${uf}. Use uma sigla de 2 letras (ex SP, RJ, MG).`,
    fix: "Informe uma das 27 siglas de UF brasileiras.",
    tags: ["ibge-localidades", "validacao"],
  },
  ENTRADA_INVALIDA: {
    status: 422,
    message: "Entrada invalida para ferramenta de IBGE Localidades.",
    why: "Os argumentos recebidos pela ferramenta nao casam com o schema esperado.",
    tags: ["ibge-localidades", "validacao"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    "ibge-localidades": typeof ibgeLocalidadesErrors;
  }
}
