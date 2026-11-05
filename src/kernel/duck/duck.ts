import { Context, Effect, Layer, Option, Schema } from "effect";
import * as Arr from "effect/Array";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Path from "effect/Path";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { BunServices } from "@effect/platform-bun";
import { DuckDBInstance } from "@duckdb/node-api";
import { dataDirPath } from "../data-dir";
import { normalize } from "../text/normalize";

const DuckErrorCode = Schema.Literals([
  "duck.OPEN",
  "duck.EXTENSION",
  "duck.QUERY",
  "duck.DECODE",
  "duck.STAGE",
]);
type DuckErrorCode = (typeof DuckErrorCode)["Type"];

class DuckError extends Schema.TaggedError<DuckError, { readonly brand: unique symbol }>()(
  "DuckError",
  {
    code: DuckErrorCode,
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "duck.OPEN":
        return "Falha ao abrir o banco local (DuckDB).";
      case "duck.EXTENSION":
        return "Falha ao carregar a extensao de busca do DuckDB. Na primeira execucao ela e baixada uma unica vez; verifique a conexao.";
      case "duck.QUERY":
        return "Falha ao consultar o banco local.";
      case "duck.DECODE":
        return "Resposta inesperada do banco local.";
      case "duck.STAGE":
        return "Falha ao preparar os dados para carga no banco local.";
    }
  }
}

export const DuckConfig = Context.Reference<{ readonly dir: Option.Option<string> }>(
  "dados-publicos-mcp/kernel/duck/duck/DuckConfig",
  { defaultValue: () => ({ dir: Option.none() }) }
);

const InTransaction = Context.Reference<boolean>(
  "dados-publicos-mcp/kernel/duck/duck/InTransaction",
  {
    defaultValue: () => false,
  }
);

export type DuckParam = null | boolean | number | bigint | string;

const DuckType = Schema.Literals([
  "VARCHAR",
  "INTEGER",
  "BIGINT",
  "DOUBLE",
  "BOOLEAN",
  "DATE",
  "TIMESTAMP",
  "VARCHAR[]",
  "JSON",
]);

const DuckTable = Schema.Struct({
  name: Schema.String,
  columns: Schema.Record(Schema.String, DuckType),
  key: Schema.String,
  search: Schema.optional(Schema.Array(Schema.String)),
});
export type DuckTable = (typeof DuckTable)["Type"];

const RankedSpec = Schema.Struct({
  select: Schema.String,
  tie: Schema.String,
  termo: Schema.String,
  uf: Schema.optional(Schema.String),
  limit: Schema.Finite,
});
type RankedSpec = (typeof RankedSpec)["Type"];

const DuckRow = Schema.Record(Schema.String, Schema.Unknown);
type DuckRow = (typeof DuckRow)["Type"];

const duckFileName = "dados.duckdb";

const NdJson = Schema.fromJsonString(Schema.Unknown);

const identifier = (name: string) => `"${Str.replaceAll('"', '""')(name)}"`;

const literal = (value: string) => `'${Str.replaceAll("'", "''")(value)}'`;

const columnList = (table: DuckTable) =>
  pipe(
    Rec.toEntries(table.columns),
    Arr.map(([column, type]) => `${identifier(column)} ${type}`),
    Arr.join(", ")
  );

const jsonColumns = (table: DuckTable) =>
  `{${pipe(
    Rec.toEntries(table.columns),
    Arr.map(([column, type]) => `${literal(column)}: ${literal(type)}`),
    Arr.join(", ")
  )}}`;

const idSeparator = "\u001f";

export const inIds = (column: string) =>
  `${identifier(column)} IN (SELECT unnest(string_split(?, chr(31))))`;

export const idsParam = (ids: readonly (string | number)[]) =>
  Arr.join(Arr.map(ids, String), idSeparator);

export const bm25 = (table: DuckTable) =>
  `fts_main_${table.name}.match_bm25(${identifier(table.key)}, ?)`;

const makeDuck = Effect.gen(function* () {
  const cfg = yield* DuckConfig;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const base = yield* dataDirPath.pipe(
    Effect.mapError((cause) => DuckError.make({ code: "duck.OPEN", cause: cause.message }))
  );
  const dir = Option.getOrElse(cfg.dir, () => base);
  yield* fs
    .makeDirectory(dir, { recursive: true })
    .pipe(Effect.mapError((cause) => DuckError.make({ code: "duck.OPEN", cause: String(cause) })));

  const instance = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () =>
        DuckDBInstance.create(path.join(dir, duckFileName), {
          extension_directory: path.join(base, "duckdb-extensions"),
        }),
      catch: (cause) => DuckError.make({ code: "duck.OPEN", cause: String(cause) }),
    }),
    (opened) => Effect.sync(() => opened.closeSync())
  );

  const connection = yield* Effect.acquireRelease(
    Effect.tryPromise({
      try: () => instance.connect(),
      catch: (cause) => DuckError.make({ code: "duck.OPEN", cause: String(cause) }),
    }),
    (opened) => Effect.sync(() => opened.closeSync())
  );

  yield* Effect.tryPromise({
    try: () => connection.run("INSTALL fts; LOAD fts;"),
    catch: (cause) => DuckError.make({ code: "duck.EXTENSION", cause: String(cause) }),
  });

  const run = (sql: string, params: readonly DuckParam[] = []) =>
    Effect.tryPromise({
      try: () => connection.run(sql, [...params]),
      catch: (cause) => DuckError.make({ code: "duck.QUERY", cause: String(cause) }),
    }).pipe(Effect.asVoid);

  const query = <S extends Schema.Top & { readonly DecodingServices: never }>(
    schema: S,
    sql: string,
    params: readonly DuckParam[] = []
  ) =>
    Effect.tryPromise({
      try: () => connection.runAndReadAll(sql, [...params]),
      catch: (cause) => DuckError.make({ code: "duck.QUERY", cause: String(cause) }),
    }).pipe(
      Effect.flatMap((reader) =>
        Schema.decodeEffect(Schema.Array(schema))(reader.getRowObjectsJson()).pipe(
          Effect.mapError((cause) => DuckError.make({ code: "duck.DECODE", cause: cause.message }))
        )
      )
    );

  const ranked = <S extends Schema.Top & { readonly DecodingServices: never }>(
    schema: S,
    table: DuckTable,
    spec: RankedSpec
  ) => {
    const q = normalize(spec.termo);
    const uf = Option.fromNullishOr(spec.uf);
    return Str.isNonEmpty(q)
      ? query(
          schema,
          `SELECT ${spec.select}, score
           FROM (SELECT *, ${bm25(table)} AS score FROM ${identifier(table.name)})
           WHERE score IS NOT NULL${Option.isSome(uf) ? " AND uf = ?" : ""}
           ORDER BY score DESC, ${spec.tie} LIMIT ?`,
          [
            q,
            ...Option.match(uf, { onNone: () => [], onSome: (value) => [Str.toUpperCase(value)] }),
            spec.limit,
          ]
        )
      : Effect.succeed<readonly S["Type"][]>([]);
  };

  const transaction = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(InTransaction, (open) =>
      open
        ? effect
        : Effect.acquireUseRelease(
            run("BEGIN TRANSACTION"),
            () => effect.pipe(Effect.provideService(InTransaction, true)),
            (_, exit) =>
              (exit._tag === "Success" ? run("COMMIT") : run("ROLLBACK")).pipe(Effect.orDie)
          )
    );

  const stage = (rows: ReadonlyArray<DuckRow>) =>
    Effect.gen(function* () {
      const staging = yield* fs.makeTempDirectoryScoped({ directory: dir, prefix: "staging-" });
      const file = path.join(staging, "rows.ndjson");
      const lines = yield* Effect.forEach(rows, (row) => Schema.encodeEffect(NdJson)(row));
      yield* fs.writeFileString(file, Arr.join(lines, "\n"));
      return file;
    }).pipe(
      Effect.mapError((cause) => DuckError.make({ code: "duck.STAGE", cause: String(cause) }))
    );

  const ensure = (table: DuckTable) =>
    run(`CREATE TABLE IF NOT EXISTS ${identifier(table.name)} (${columnList(table)})`);

  const create = (table: DuckTable) =>
    run(`CREATE OR REPLACE TABLE ${identifier(table.name)} (${columnList(table)})`);

  const append = (table: DuckTable, rows: ReadonlyArray<DuckRow>) =>
    Arr.isReadonlyArrayNonEmpty(rows)
      ? Effect.scoped(
          stage(rows).pipe(
            Effect.flatMap((file) =>
              run(
                `INSERT INTO ${identifier(table.name)} SELECT * FROM read_json(?, format = 'newline_delimited', columns = ${jsonColumns(table)})`,
                [file]
              )
            )
          )
        ).pipe(Effect.as(rows.length))
      : Effect.succeed(0);

  const replace = (table: DuckTable, rows: ReadonlyArray<DuckRow>) =>
    transaction(create(table).pipe(Effect.andThen(append(table, rows)))).pipe(
      Effect.tap(() => reindex(table))
    );

  const reindex = (table: DuckTable) =>
    Option.match(Option.filter(Option.fromNullishOr(table.search), Arr.isReadonlyArrayNonEmpty), {
      onNone: () => Effect.void,
      onSome: (columns) =>
        run(
          `PRAGMA create_fts_index(${literal(table.name)}, ${literal(table.key)}, ${pipe(
            columns,
            Arr.map(literal),
            Arr.join(", ")
          )}, stemmer = 'portuguese', stopwords = 'none', strip_accents = 1, lower = 1, overwrite = 1)`
        ),
    });

  const count = (table: DuckTable) =>
    query(
      Schema.Struct({ count: Schema.Finite }),
      `SELECT count(*)::INTEGER AS count FROM ${identifier(table.name)}`
    ).pipe(
      Effect.map((rows) =>
        Option.getOrElse(
          Option.map(Arr.head(rows), (row) => row.count),
          () => 0
        )
      ),
      Effect.orElseSucceed(() => 0)
    );

  return { dir, run, query, ranked, transaction, ensure, create, append, replace, reindex, count };
});

export class Duck extends Context.Service<Duck, Effect.Success<typeof makeDuck>>()(
  "dados-publicos-mcp/kernel/duck/duck"
) {}

export const DuckLive = Layer.effect(Duck)(makeDuck).pipe(Layer.provide(BunServices.layer));
