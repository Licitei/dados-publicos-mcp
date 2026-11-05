import { Schema } from "effect";
import * as Arr from "effect/Array";
import * as Predicate from "effect/Predicate";
import { dual, pipe } from "effect/Function";
import type { DuckTable } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const precoPraticadoTable: DuckTable = {
  name: "preco_praticado",
  key: "id",
  columns: {
    id: "BIGINT",
    idItemCompra: "VARCHAR",
    idCompra: "VARCHAR",
    codigoItemCatalogo: "VARCHAR",
    descricaoItem: "VARCHAR",
    precoUnitario: "DOUBLE",
    quantidade: "DOUBLE",
    unidadeFornecimento: "VARCHAR",
    niFornecedor: "VARCHAR",
    docNormalizado: "VARCHAR",
    nomeFornecedor: "VARCHAR",
    marca: "VARCHAR",
    dataCompra: "VARCHAR",
    estado: "VARCHAR",
    codigoMunicipio: "VARCHAR",
    municipio: "VARCHAR",
    codigoUasg: "VARCHAR",
    nomeOrgao: "VARCHAR",
    codigoClasse: "VARCHAR",
    nomeClasse: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const moduloPrecoBase = "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco";

const pageSize = 500;
export const maxPaginas = 5;

export const consultarMaterialUrl: {
  (pagina: number): (codigo: string) => string;
  (codigo: string, pagina: number): string;
} = dual(
  2,
  (codigo: string, pagina: number) =>
    `${moduloPrecoBase}/1_consultarMaterial?pagina=${pagina}&tamanhoPagina=${pageSize}&codigoItemCatalogo=${codigo}`
);

const Escalar = Schema.optional(Schema.NullOr(Schema.Union([Schema.Finite, Schema.String])));

const RecordRaw = Schema.Struct({
  idCompra: Escalar,
  idItemCompra: Escalar,
  codigoItemCatalogo: Escalar,
  descricaoItem: Schema.optional(Schema.NullOr(Schema.String)),
  precoUnitario: Schema.optional(Schema.NullOr(Schema.Finite)),
  quantidade: Schema.optional(Schema.NullOr(Schema.Finite)),
  siglaUnidadeFornecimento: Schema.optional(Schema.NullOr(Schema.String)),
  niFornecedor: Escalar,
  nomeFornecedor: Schema.optional(Schema.NullOr(Schema.String)),
  marca: Schema.optional(Schema.NullOr(Schema.String)),
  dataCompra: Schema.optional(Schema.NullOr(Schema.String)),
  estado: Schema.optional(Schema.NullOr(Schema.String)),
  codigoMunicipio: Escalar,
  municipio: Schema.optional(Schema.NullOr(Schema.String)),
  codigoUasg: Escalar,
  nomeOrgao: Schema.optional(Schema.NullOr(Schema.String)),
  codigoClasse: Escalar,
  nomeClasse: Schema.optional(Schema.NullOr(Schema.String)),
});
type RecordRaw = (typeof RecordRaw)["Type"];

export const PrecoPayload = Schema.Struct({
  resultado: Schema.optional(Schema.NullOr(Schema.Array(RecordRaw))),
  totalRegistros: Schema.optional(Schema.NullOr(Schema.Finite)),
  totalPaginas: Schema.optional(Schema.NullOr(Schema.Finite)),
});
export type PrecoPayload = (typeof PrecoPayload)["Type"];

export const PrecoFlat = Schema.Struct({
  idItemCompra: Schema.NullOr(Schema.String),
  idCompra: Schema.NullOr(Schema.String),
  codigoItemCatalogo: Schema.NullOr(Schema.String),
  descricaoItem: Schema.NullOr(Schema.String),
  precoUnitario: Schema.NullOr(Schema.Finite),
  quantidade: Schema.NullOr(Schema.Finite),
  unidadeFornecimento: Schema.NullOr(Schema.String),
  niFornecedor: Schema.NullOr(Schema.String),
  docNormalizado: Schema.NullOr(Schema.String),
  nomeFornecedor: Schema.NullOr(Schema.String),
  marca: Schema.NullOr(Schema.String),
  dataCompra: Schema.NullOr(Schema.String),
  estado: Schema.NullOr(Schema.String),
  codigoMunicipio: Schema.NullOr(Schema.String),
  municipio: Schema.NullOr(Schema.String),
  codigoUasg: Schema.NullOr(Schema.String),
  nomeOrgao: Schema.NullOr(Schema.String),
  codigoClasse: Schema.NullOr(Schema.String),
  nomeClasse: Schema.NullOr(Schema.String),
  busca: Schema.String,
});
export type PrecoFlat = (typeof PrecoFlat)["Type"];

const asString = (value: number | string | null | undefined) =>
  value === null || value === undefined ? null : String(value);

export const mapPrecos = (records: readonly RecordRaw[]): readonly PrecoFlat[] =>
  Arr.map(records, (record) => {
    const niFornecedor = asString(record.niFornecedor);
    return {
      idItemCompra: asString(record.idItemCompra),
      idCompra: asString(record.idCompra),
      codigoItemCatalogo: asString(record.codigoItemCatalogo),
      descricaoItem: record.descricaoItem ?? null,
      precoUnitario: record.precoUnitario ?? null,
      quantidade: record.quantidade ?? null,
      unidadeFornecimento: record.siglaUnidadeFornecimento ?? null,
      niFornecedor,
      docNormalizado:
        niFornecedor === null || niFornecedor === "" ? null : onlyDigits(niFornecedor),
      nomeFornecedor: record.nomeFornecedor ?? null,
      marca: record.marca ?? null,
      dataCompra: record.dataCompra ?? null,
      estado: record.estado ?? null,
      codigoMunicipio: asString(record.codigoMunicipio),
      municipio: record.municipio ?? null,
      codigoUasg: asString(record.codigoUasg),
      nomeOrgao: record.nomeOrgao ?? null,
      codigoClasse: asString(record.codigoClasse),
      nomeClasse: record.nomeClasse ?? null,
      busca: normalize(
        pipe(
          [record.descricaoItem, record.nomeClasse, record.nomeOrgao],
          Arr.filter(Predicate.isNotNullish),
          Arr.join(" ")
        )
      ),
    } satisfies PrecoFlat;
  });
