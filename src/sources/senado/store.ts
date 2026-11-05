import { Context, Effect, Layer, Schema, Struct } from "effect";
import * as Arr from "effect/Array";
import { bm25, Duck, type DuckTable, idsParam, inIds } from "../../kernel/duck/duck";
import { Fuzzy } from "../../kernel/search/fuzzy";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { defaultAno, CeapsFlat, SenadorFlat } from "./catalog";
import { loadCeapsAno, loadSenadores } from "./indexer";
import { clamp } from "../../kernel/duck/search";

export const senadorTable: DuckTable = {
  name: "senador",
  key: "id",
  columns: {
    id: "VARCHAR",
    codigo: "VARCHAR",
    nome: "VARCHAR",
    nomeCompleto: "VARCHAR",
    sexo: "VARCHAR",
    partido: "VARCHAR",
    uf: "VARCHAR",
    email: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const ceapsTable: DuckTable = {
  name: "ceaps_despesa",
  key: "id",
  columns: {
    id: "VARCHAR",
    ano: "INTEGER",
    mes: "INTEGER",
    senador: "VARCHAR",
    tipoDespesa: "VARCHAR",
    cnpjCpf: "VARCHAR",
    docNormalizado: "VARCHAR",
    fornecedor: "VARCHAR",
    documento: "VARCHAR",
    data: "VARCHAR",
    detalhamento: "VARCHAR",
    valorReembolsado: "DOUBLE",
    codDocumento: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

const SenadorRow = Schema.Struct({
  ...SenadorFlat.mapFields(Struct.omit(["busca"])).fields,
  score: Schema.Finite,
});

const CeapsDespesa = CeapsFlat.mapFields(Struct.omit(["busca"]));

const CeapsRow = Schema.Struct({ ...CeapsDespesa.fields, score: Schema.Finite });

const senadorColumns = `codigo, nome, "nomeCompleto", sexo, partido, uf, email`;

const ceapsColumns = `ano::INTEGER AS ano, mes::INTEGER AS mes, senador, "tipoDespesa", "cnpjCpf", "docNormalizado",
  fornecedor, documento, data, detalhamento, "valorReembolsado"::DOUBLE AS "valorReembolsado", "codDocumento"`;

const withIds = <A extends object>(prefix: string, rows: readonly A[]) =>
  Arr.map(rows, (row, position) => ({ id: `${prefix}${position}`, ...row }));

const makeSenado = Effect.gen(function* () {
  const duck = yield* Duck;
  const fuzzy = yield* Fuzzy;

  const buscarSenador = (nome: string, limit?: number) =>
    Effect.gen(function* () {
      const max = clamp(limit, 50, 100);
      const query = normalize(nome);
      const exact = yield* duck.query(
        SenadorRow,
        `SELECT ${senadorColumns}, score
         FROM (SELECT *, ${bm25(senadorTable)} AS score FROM senador)
         WHERE score IS NOT NULL ORDER BY score DESC, nome LIMIT ?`,
        [query, max]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(exact)
        ? []
        : yield* fuzzy.match("senado-senador", query, { limit: max });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            SenadorRow,
            `SELECT ${senadorColumns}, 0::DOUBLE AS score FROM senador WHERE ${inIds("id")} ORDER BY nome`,
            [idsParam(ids)]
          )
        : [];
      return Arr.isReadonlyArrayNonEmpty(exact) ? exact : approximate;
    });

  const buscarFornecedorCeaps = (termo: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const limit = clamp(options?.limit, 50, 200);
      const query = normalize(termo);
      const lexical = yield* duck.query(
        CeapsRow,
        `SELECT ${ceapsColumns}, score
         FROM (SELECT *, ${bm25(ceapsTable)} AS score FROM ceaps_despesa)
         WHERE score IS NOT NULL ORDER BY score DESC, id LIMIT ?`,
        [query, limit]
      );
      const ids = Arr.isReadonlyArrayNonEmpty(lexical)
        ? []
        : yield* fuzzy.match("senado-ceaps", query, { limit });
      const approximate = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            CeapsRow,
            `SELECT ${ceapsColumns}, 0::DOUBLE AS score FROM ceaps_despesa WHERE ${inIds("busca")} ORDER BY id LIMIT ?`,
            [idsParam(ids), limit]
          )
        : [];
      return Arr.isReadonlyArrayNonEmpty(lexical) ? lexical : approximate;
    });

  const gastosPorFornecedor = (documentoInput: string) =>
    Effect.gen(function* () {
      const docNormalizado = onlyDigits(documentoInput);
      const despesas = yield* duck.query(
        CeapsDespesa,
        `SELECT ${ceapsColumns} FROM ceaps_despesa WHERE "docNormalizado" = ? ORDER BY data DESC NULLS LAST, id`,
        [docNormalizado]
      );
      const total = Arr.reduce(despesas, 0, (sum, row) => sum + (row.valorReembolsado ?? 0));
      return {
        documento: documentoInput,
        docNormalizado,
        total,
        count: despesas.length,
        despesas,
      };
    });

  const writeCeapsFuzzy = Effect.gen(function* () {
    const rows = yield* duck.query(
      Schema.Struct({ busca: Schema.String }),
      `SELECT DISTINCT busca FROM ceaps_despesa WHERE busca <> ''`
    );
    yield* fuzzy.write(
      "senado-ceaps",
      Arr.map(rows, (row): readonly [string, string] => [row.busca, row.busca])
    );
  });

  const indexCeaps = (ano: number) =>
    Effect.gen(function* () {
      const rows = yield* loadCeapsAno(ano);
      yield* duck.transaction(
        duck
          .ensure(ceapsTable)
          .pipe(
            Effect.andThen(duck.run("DELETE FROM ceaps_despesa WHERE ano = ?", [ano])),
            Effect.andThen(duck.append(ceapsTable, withIds(`${ano}-`, rows)))
          )
      );
      yield* duck.reindex(ceapsTable);
      yield* writeCeapsFuzzy;
      return rows.length;
    });

  const index = Effect.gen(function* () {
    const rows = yield* loadSenadores;
    yield* duck.replace(senadorTable, withIds("s", rows));
    yield* fuzzy.write(
      "senado-senador",
      Arr.map(withIds("s", rows), (row): readonly [string, string] => [row.id, row.busca])
    );
    const ceaps = yield* indexCeaps(defaultAno);
    return { senadores: rows.length, ceaps };
  });

  const indexAno = (ano: number) =>
    Effect.gen(function* () {
      const ceaps = yield* indexCeaps(ano);
      return { ceaps };
    });

  return {
    index,
    indexAno,
    buscarSenador,
    buscarFornecedorCeaps,
    gastosPorFornecedor,
  };
});

export class SenadoFederal extends Context.Service<
  SenadoFederal,
  Effect.Success<typeof makeSenado>
>()("dados-publicos-mcp/sources/senado/store/SenadoFederal") {}

export const SenadoFederalLive = Layer.effect(SenadoFederal)(makeSenado);
