import { Context, Effect, Layer, Match, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import { bm25, Duck, type DuckParam, type DuckTable, idsParam } from "../../kernel/duck/duck";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import {
  defaultScope,
  excerpt,
  extractCnpjs,
  QueridoDiarioError,
  type DiarioFlat,
} from "./catalog";
import { loadDiarios } from "./indexer";
import { appendRows } from "../../kernel/duck/append";
import { clamp } from "../../kernel/duck/search";

export const diarioTable: DuckTable = {
  name: "diario",
  key: "id",
  columns: {
    id: "INTEGER",
    territoryId: "VARCHAR",
    uf: "VARCHAR",
    municipio: "VARCHAR",
    ano: "INTEGER",
    data: "VARCHAR",
    poder: "VARCHAR",
    edicao: "VARCHAR",
    edicaoExtra: "VARCHAR",
    urlOriginal: "VARCHAR",
    conteudo: "VARCHAR",
    busca: "VARCHAR",
  },
  search: ["busca"],
};

export const diarioCnpjTable: DuckTable = {
  name: "diario_cnpj",
  key: "id",
  columns: { id: "INTEGER", diarioId: "INTEGER", cnpj: "VARCHAR" },
};

const NullableString = Schema.NullOr(Schema.String);

const DiarioBase = {
  id: Schema.Finite,
  territoryId: Schema.String,
  uf: Schema.String,
  municipio: Schema.String,
  ano: Schema.NullOr(Schema.Finite),
  data: NullableString,
  poder: NullableString,
  edicao: NullableString,
  urlOriginal: NullableString,
};

const DiarioHit = Schema.Struct({
  ...DiarioBase,
  edicaoExtra: NullableString,
  conteudo: Schema.String,
  score: Schema.Finite,
});

const DiarioListed = Schema.Struct({ ...DiarioBase, edicaoExtra: NullableString });

const DiarioFull = Schema.Struct({ ...DiarioBase, conteudo: Schema.String });

const CnpjMatch = Schema.Struct({ diarioId: Schema.Finite, cnpj: Schema.String });

const diarioColumns = `id, "territoryId", uf, municipio, ano::INTEGER AS ano, data, poder, edicao, "urlOriginal"`;

const chunkSize = 2_000;
const excerptLimit = 600;

const chunks = <A>(items: readonly A[]) => pipe(items, Arr.chunksOf(chunkSize));

const makeQueridoDiario = Effect.gen(function* () {
  const duck = yield* Duck;

  const insertChunk = (batch: readonly DiarioFlat[]) =>
    Effect.gen(function* () {
      const offset = yield* duck.count(diarioTable);
      const cnpjOffset = yield* duck.count(diarioCnpjTable);
      yield* duck.append(
        diarioTable,
        Arr.map(batch, (row, position) => ({ ...row, id: offset + position + 1 }))
      );
      const cnpjRows = pipe(
        batch,
        Arr.flatMap((row, position) =>
          Arr.map(extractCnpjs(row.conteudo), (cnpj) => ({ diarioId: offset + position + 1, cnpj }))
        ),
        Arr.map((row, position) => ({ ...row, id: cnpjOffset + position + 1 }))
      );
      yield* appendRows(diarioCnpjTable, cnpjRows);
      return cnpjRows.length;
    });

  const indexDiarios = (flat: readonly DiarioFlat[]) =>
    Effect.gen(function* () {
      const counts = yield* Effect.forEach(chunks(flat), insertChunk, {
        concurrency: 1,
      });
      return {
        diarios: flat.length,
        cnpjs: Arr.reduce(counts, 0, (acc, count) => acc + count),
      };
    });

  const indexScope = (scope: readonly { readonly uf: string; readonly ano: number }[]) =>
    Effect.gen(function* () {
      yield* duck.create(diarioTable);
      yield* duck.create(diarioCnpjTable);
      const counts = yield* Effect.forEach(
        scope,
        ({ uf, ano }) => Effect.flatMap(loadDiarios(uf, ano), indexDiarios),
        { concurrency: 1 }
      );
      yield* duck.reindex(diarioTable);
      return Arr.reduce(counts, { diarios: 0, cnpjs: 0 }, (acc, count) => ({
        diarios: acc.diarios + count.diarios,
        cnpjs: acc.cnpjs + count.cnpjs,
      }));
    });

  const buscarDiarios = (
    termo: string,
    options?: { readonly territoryId?: string; readonly limit?: number }
  ) =>
    Effect.gen(function* () {
      const q = normalize(termo);
      yield* Match.value(q.length).pipe(
        Match.when(0, () =>
          Effect.fail(QueridoDiarioError.make({ code: "querido-diario.MISSING_TERMO" }))
        ),
        Match.orElse(() => Effect.void)
      );
      const limit = clamp(options?.limit, 20, 100);
      const territory = Option.fromNullishOr(options?.territoryId);
      const filter = Option.match(territory, {
        onNone: () => "",
        onSome: () => `AND "territoryId" = ?`,
      });
      const params: readonly DuckParam[] = Option.match(territory, {
        onNone: () => [q, limit],
        onSome: (value) => [q, value, limit],
      });
      return yield* duck.query(
        DiarioHit,
        `SELECT ${diarioColumns}, "edicaoExtra", substr(conteudo, 1, ${excerptLimit}) AS conteudo, score
         FROM (SELECT *, ${bm25(diarioTable)} AS score FROM diario)
         WHERE score IS NOT NULL ${filter}
         ORDER BY score DESC, id LIMIT ?`,
        params
      );
    });

  const diariosPorMunicipio = (territoryId: string, options?: { readonly limit?: number }) =>
    duck.query(
      DiarioListed,
      `SELECT ${diarioColumns}, "edicaoExtra" FROM diario WHERE "territoryId" = ? ORDER BY data DESC NULLS LAST, id LIMIT ?`,
      [territoryId, clamp(options?.limit, 20, 100)]
    );

  const buscarCnpjEmDiario = (cnpj: string, options?: { readonly limit?: number }) =>
    Effect.gen(function* () {
      const alvo = onlyDigits(cnpj);
      const limit = clamp(options?.limit, 20, 100);
      const matches = yield* duck.query(
        CnpjMatch,
        `SELECT "diarioId", cnpj FROM diario_cnpj WHERE cnpj = ? ORDER BY id LIMIT ?`,
        [alvo, limit]
      );
      const ids = Arr.dedupe(Arr.map(matches, (row) => row.diarioId));
      const diarios = Arr.isReadonlyArrayNonEmpty(ids)
        ? yield* duck.query(
            DiarioFull,
            `SELECT ${diarioColumns}, conteudo FROM diario WHERE id IN (SELECT unnest(string_split(?, chr(31)))::INTEGER)`,
            [idsParam(ids)]
          )
        : [];
      return Arr.flatMap(matches, (match) =>
        pipe(
          Arr.findFirst(diarios, (row) => row.id === match.diarioId),
          Option.map((found) => ({
            cnpj: match.cnpj,
            diario: { ...found, conteudo: excerpt(found.conteudo, excerptLimit) },
          })),
          Option.toArray
        )
      );
    });

  const index = indexScope(defaultScope);

  return {
    index,
    indexAll: index,
    indexScope,
    buscarDiarios,
    diariosPorMunicipio,
    buscarCnpjEmDiario,
  };
});

export class QueridoDiario extends Context.Service<
  QueridoDiario,
  Effect.Success<typeof makeQueridoDiario>
>()("dados-publicos-mcp/sources/querido-diario/store/QueridoDiario") {}

export const QueridoDiarioLive = Layer.effect(QueridoDiario)(makeQueridoDiario);
