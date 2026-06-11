import { defineErrorCatalog } from "evlog";

/**
 * Catalogo declarativo de erros do dominio CAPAG (estilo dfe-kit/evlog).
 *
 * Cada fabrica retorna um EvlogError ja formado (code = "capag.<CHAVE>",
 * message, status, why/fix). Use inline no ponto de decisao:
 *   return yield* Result.err(capagErrors.FONTE_DOWNLOAD({ url }));
 * Para invariantes (bug/estado impossivel, ex.: XLSX malformado) use panic()
 * do better-result.
 */
export const capagErrors = defineErrorCatalog("capag", {
  INDICE_AUSENTE: {
    status: 404,
    message: ({ path }: { path: string }) =>
      `Indice CAPAG nao encontrado. Rode a tool indexar_capag. Caminho esperado: ${path}`,
    why: "O banco SQLite do dominio CAPAG ainda nao foi construido nesta maquina.",
    fix: "Rode: bun src/index.ts index capag (ou a tool indexar_capag).",
    tags: ["capag", "indice"],
  },
  ENTRADA_INVALIDA: {
    status: 422,
    message: ({ detalhe }: { detalhe: string }) => detalhe,
    fix: "Informe os parametros exigidos pela ferramenta CAPAG.",
    tags: ["capag", "entrada"],
  },
  CNPJ_INVALIDO: {
    status: 422,
    message: ({ cnpj }: { cnpj: string }) =>
      `CNPJ invalido: ${cnpj}. Use 14 digitos.`,
    fix: "Envie um CNPJ com exatamente 14 digitos numericos.",
    tags: ["capag", "entrada"],
  },
  FONTE_DOWNLOAD: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `Falha ao baixar a fonte CAPAG/SICONFI: ${url}`,
    tags: ["capag", "rede", "retryable"],
  },
  CKAN_SEM_SUCESSO: {
    status: 502,
    message: ({ url }: { url: string }) =>
      `CKAN package_show sem sucesso: ${url}`,
    tags: ["capag", "rede"],
  },
  RESOURCE_AUSENTE: {
    status: 502,
    message: ({ format, url }: { format: string; url: string }) =>
      `Nenhum resource ${format} encontrado em ${url}.`,
    tags: ["capag", "fonte"],
  },
  MUNICIPIOS_VAZIO: {
    status: 502,
    message: "Nenhum resource de municipios encontrado no CKAN.",
    tags: ["capag", "fonte"],
  },
  FONTE_PARSE: {
    status: 500,
    message: "Falha ao parsear o XLSX de municipios CAPAG.",
    tags: ["capag", "parse"],
  },
  CONSULTA: {
    status: 500,
    message: "Falha ao consultar o indice CAPAG.",
    tags: ["capag", "io"],
  },
});

declare module "evlog" {
  interface RegisteredErrorCatalogs {
    capag: typeof capagErrors;
  }
}
