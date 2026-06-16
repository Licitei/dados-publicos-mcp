import { Schema } from "effect";
import { normalize, onlyDigits } from "../../kernel/text/normalize";

export const moduloPrecoBase =
  "https://dadosabertos.compras.gov.br/modulo-pesquisa-preco";

export const pageSize = 500;
export const maxPaginas = 5;

export const consultarMaterialUrl = (
  codigo: string,
  pagina: number
) =>
  `${moduloPrecoBase}/1_consultarMaterial?pagina=${pagina}&tamanhoPagina=${pageSize}&codigoItemCatalogo=${codigo}`;

const Escalar = Schema.optional(
  Schema.NullOr(Schema.Union([Schema.Number, Schema.String]))
);

const RecordRaw = Schema.Struct({
  idCompra: Escalar,
  idItemCompra: Escalar,
  codigoItemCatalogo: Escalar,
  descricaoItem: Schema.optional(Schema.NullOr(Schema.String)),
  precoUnitario: Schema.optional(Schema.NullOr(Schema.Number)),
  quantidade: Schema.optional(Schema.NullOr(Schema.Number)),
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
export type RecordRaw = (typeof RecordRaw)["Type"];

export const PrecoPayload = Schema.Struct({
  resultado: Schema.optional(Schema.NullOr(Schema.Array(RecordRaw))),
  totalRegistros: Schema.optional(Schema.NullOr(Schema.Number)),
  totalPaginas: Schema.optional(Schema.NullOr(Schema.Number)),
});
export type PrecoPayload = (typeof PrecoPayload)["Type"];

export const PrecoFlat = Schema.Struct({
  idItemCompra: Schema.NullOr(Schema.String),
  idCompra: Schema.NullOr(Schema.String),
  codigoItemCatalogo: Schema.NullOr(Schema.String),
  descricaoItem: Schema.NullOr(Schema.String),
  precoUnitario: Schema.NullOr(Schema.Number),
  quantidade: Schema.NullOr(Schema.Number),
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

export const mapPrecos = (
  records: readonly RecordRaw[]
): readonly PrecoFlat[] =>
  records.map((record) => {
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
      docNormalizado: niFornecedor ? onlyDigits(niFornecedor) : null,
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
        [record.descricaoItem, record.nomeClasse, record.nomeOrgao]
          .filter((part) => part !== null && part !== undefined)
          .join(" ")
      ),
    } satisfies PrecoFlat;
  });
