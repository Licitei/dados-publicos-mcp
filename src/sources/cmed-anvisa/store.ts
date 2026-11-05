import { Context, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Struct from "effect/Struct";
import { bm25, Duck, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { MedicamentoFlat } from "./catalog";
import { indexCmed } from "./indexer";
import { clamp, preferExact } from "../../kernel/duck/search";

export const medicamentoCmedTable: DuckTable = {
  name: "medicamento_cmed",
  key: "id",
  columns: {
    id: "VARCHAR",
    substancia: "VARCHAR",
    cnpj: "VARCHAR",
    docNormalizado: "VARCHAR",
    laboratorio: "VARCHAR",
    ggrem: "VARCHAR",
    registro: "VARCHAR",
    ean1: "VARCHAR",
    produto: "VARCHAR",
    apresentacao: "VARCHAR",
    classeTerapeutica: "VARCHAR",
    tarja: "VARCHAR",
    pfSemImpostos: "DOUBLE",
    pmvgSemImpostos: "DOUBLE",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const MedicamentoRow = Schema.Struct(pipe(MedicamentoFlat.fields, Struct.omit(["busca"])));
const MedicamentoScored = Schema.Struct({
  ...MedicamentoRow.fields,
  id: Schema.String,
  score: Schema.Finite,
});

const medicamentoColumns = `id, substancia, cnpj, "docNormalizado", laboratorio, ggrem, registro, ean1, produto,
  apresentacao, "classeTerapeutica", tarja, "pfSemImpostos", "pmvgSemImpostos"`;

const makeCmed = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const buscarMedicamento = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      const limit = clamp(options?.limit, 30, 100);
      const exact = yield* duck.query(
        MedicamentoScored,
        `SELECT ${medicamentoColumns}, score
         FROM (SELECT *, ${bm25(medicamentoCmedTable)} AS score FROM medicamento_cmed)
         WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT ?`,
        [q, limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("medicamento_cmed", q, { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            MedicamentoScored,
            `SELECT ${medicamentoColumns}, 0::DOUBLE AS score FROM medicamento_cmed WHERE ${inIds("id")}`,
            [idsParam(ids)]
          )
        : [];
      return preferExact(exact, ids, approximate, (row) => row.id);
    });

  const precoPorEan = (ean: string) =>
    duck.query(
      MedicamentoRow,
      `SELECT ${medicamentoColumns} FROM medicamento_cmed WHERE ean1 = ? LIMIT 10`,
      [onlyDigits(ean)]
    );

  const precoPorGgrem = (ggrem: string) =>
    duck.query(
      MedicamentoRow,
      `SELECT ${medicamentoColumns} FROM medicamento_cmed WHERE ggrem = ? LIMIT 10`,
      [onlyDigits(ggrem)]
    );

  const index = Effect.gen(function* () {
    const flat = yield* indexCmed;
    const rows = Arr.map(flat, (row, position) => ({ ...row, id: String(position) }));
    const inserted = yield* duck.replace(medicamentoCmedTable, rows);
    yield* fuzzy.write(
      "medicamento_cmed",
      Arr.map(rows, (row): readonly [string, string] => [row.id, row.busca])
    );
    return { inserted, total: yield* duck.count(medicamentoCmedTable) };
  });

  return { index, indexAll: index, buscarMedicamento, precoPorEan, precoPorGgrem };
});

export class CmedAnvisa extends Context.Service<CmedAnvisa, Effect.Success<typeof makeCmed>>()(
  "dados-publicos-mcp/sources/cmed-anvisa/store/CmedAnvisa"
) {}

export const CmedAnvisaLive = Layer.effect(CmedAnvisa)(makeCmed);
