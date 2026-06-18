import type { PgTable } from "drizzle-orm/pg-core";
import { tableDdlText } from "./ddl";
import { ata } from "./schemas/ata";
import { bem } from "./schemas/bem";
import { candidato } from "./schemas/candidato";
import { capagEstado } from "./schemas/capag-estado";
import { capagMunicipio } from "./schemas/capag-municipio";
import { catmatMaterial } from "./schemas/catmat-material";
import { catserService } from "./schemas/catser-service";
import { ceapsDespesa } from "./schemas/ceaps-despesa";
import { cnae } from "./schemas/cnae";
import { contratacao } from "./schemas/contratacao";
import { contrato } from "./schemas/contrato";
import { convenio } from "./schemas/convenio";
import { cota } from "./schemas/despesa-camara";
import { deputado } from "./schemas/deputado";
import { despesa } from "./schemas/despesa";
import { despesaFederal } from "./schemas/despesa-federal";
import { diario } from "./schemas/diario";
import { diarioCnpj } from "./schemas/diario-cnpj";
import { dominio } from "./schemas/dominio";
import { empresa } from "./schemas/empresa";
import { estabelecimento } from "./schemas/estabelecimento";
import { fornecedor } from "./schemas/fornecedor";
import { medicamentoCmed } from "./schemas/medicamento-cmed";
import { municipio } from "./schemas/municipio";
import { municipioEconomia } from "./schemas/municipio-economia";
import { node } from "./schemas/legislacao";
import { precoPraticado } from "./schemas/preco-praticado";
import { proposicao } from "./schemas/proposicao";
import { proposicaoAutor } from "./schemas/proposicao-autor";
import { receita } from "./schemas/receita";
import { receitaOriginario } from "./schemas/receita-originario";
import { sancao } from "./schemas/sancao";
import { senador } from "./schemas/senador";
import { siconfiEnte } from "./schemas/siconfi-ente";
import { siconfiFato } from "./schemas/siconfi-fato";
import { simples } from "./schemas/simples";
import { sinapiInsumo } from "./schemas/sinapi-insumo";
import { socio } from "./schemas/socio";
import { tcuInidoneo } from "./schemas/tcu-inidoneo";

type DbSource = {
  readonly key: string;
  readonly tables: Record<string, PgTable>;
};

export const dbExtensions = [
  "vector",
  "pg_textsearch",
  "ltree",
  "pg_trgm",
] as const;

export const dbSources: ReadonlyArray<DbSource> = [
  { key: "legislacao", tables: { node } },
  { key: "ibge-localidades", tables: { municipio } },
  { key: "cnae", tables: { cnae } },
  { key: "catmat-catser", tables: { catmatMaterial, catserService } },
  { key: "sicaf-fornecedores", tables: { fornecedor } },
  { key: "sancoes-cgu", tables: { sancao } },
  {
    key: "receita-cnpj",
    tables: { empresa, estabelecimento, socio, simples, dominio },
  },
  {
    key: "tse-eleitoral",
    tables: { candidato, bem, receita, despesa, receitaOriginario },
  },
  {
    key: "camara-deputados",
    tables: { deputado, cota, proposicao, proposicaoAutor },
  },
  { key: "querido-diario", tables: { diario, diarioCnpj } },
  { key: "capag", tables: { capagEstado, capagMunicipio, siconfiEnte } },
  { key: "pncp", tables: { contratacao, contrato, ata } },
  { key: "tcu-inidoneos", tables: { tcuInidoneo } },
  { key: "ibge-economia", tables: { municipioEconomia } },
  { key: "senado", tables: { senador, ceapsDespesa } },
  { key: "cmed-anvisa", tables: { medicamentoCmed } },
  { key: "siconfi-fiscal", tables: { siconfiFato } },
  { key: "transferegov", tables: { convenio } },
  { key: "painel-precos", tables: { precoPraticado } },
  { key: "transparencia-despesas", tables: { despesaFederal } },
  { key: "sinapi", tables: { sinapiInsumo } },
];

export const allDbTables: readonly PgTable[] = dbSources.flatMap((source) =>
  Object.values(source.tables)
);

export const tableGroupsBySource: Record<string, Record<string, PgTable>> =
  Object.fromEntries(
    dbSources.map((source) => [source.key, source.tables] as const)
  );

export const schemaDdlText = [
  ...dbExtensions.map((name) => `create extension if not exists "${name}"`),
  ...allDbTables.flatMap((table) => tableDdlText(table)),
].join("\n");
