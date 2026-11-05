import { Context, Effect, Layer, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { Duck, type DuckTable } from "../../kernel/duck/duck";
import { onlyDigits } from "../../kernel/text/normalize";
import { SinapiInsumoFlat } from "./catalog";
import { defaultReferencia, indexReferencia } from "./indexer";
import { clamp, conditions, ufClause } from "../../kernel/duck/search";

export const sinapiInsumoTable: DuckTable = {
  name: "sinapi_insumo",
  key: "id",
  columns: {
    id: "VARCHAR",
    mesReferencia: "VARCHAR",
    codigo: "VARCHAR",
    descricao: "VARCHAR",
    unidade: "VARCHAR",
    origem: "VARCHAR",
    classificacao: "VARCHAR",
    uf: "VARCHAR",
    precoMediano: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const InsumoRow = SinapiInsumoFlat.mapFields(Struct.omit(["busca"]));

const InsumoScored = Schema.Struct({ ...InsumoRow.fields, score: Schema.Finite });

const insumoColumns = `"mesReferencia", codigo, descricao, unidade, origem, classificacao, uf, "precoMediano"`;

const makeSinapi = Effect.gen(function* () {
  const duck = yield* Duck;

  const precoPorCodigo = (codigo: string, uf: string | undefined) =>
    Effect.gen(function* () {
      const filter = conditions([ufClause(uf)]);
      return yield* duck.query(
        InsumoRow,
        `SELECT ${insumoColumns} FROM sinapi_insumo WHERE codigo = ?${filter.sql} ORDER BY uf`,
        [onlyDigits(codigo), ...filter.params]
      );
    });

  const buscarInsumo = (
    termo: string,
    options?: { readonly uf?: string; readonly limit?: number }
  ) =>
    duck.ranked(InsumoScored, sinapiInsumoTable, {
      select: insumoColumns,
      tie: "id",
      termo,
      uf: options?.uf,
      limit: clamp(options?.limit, 50, 200),
    });

  const load = (ano: number, mes: number) =>
    Effect.gen(function* () {
      const flat = yield* indexReferencia(ano, mes);
      const rows = Arr.map(flat, (row, position) => ({ ...row, id: String(position) }));
      return yield* duck.replace(sinapiInsumoTable, rows);
    });

  const index = Effect.gen(function* () {
    const referencia = yield* defaultReferencia;
    const inserted = yield* load(referencia.ano, referencia.mes);
    return { inserted, total: yield* duck.count(sinapiInsumoTable) };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      const referencia = yield* defaultReferencia;
      const inserted = yield* load(ano, referencia.mes);
      return { inserted };
    });

  const indexReferenciaStore = (ano: number, mes: number) =>
    load(ano, mes).pipe(Effect.map((inserted) => ({ inserted })));

  return { index, indexAno, indexReferencia: indexReferenciaStore, precoPorCodigo, buscarInsumo };
});

export class Sinapi extends Context.Service<Sinapi, Effect.Success<typeof makeSinapi>>()(
  "dados-publicos-mcp/sources/sinapi/store/Sinapi"
) {}

export const SinapiLive = Layer.effect(Sinapi)(makeSinapi);
