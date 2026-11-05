import { describe, expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import { bm25, Duck, type DuckTable } from "../../src/kernel/duck/duck";
import { FixtureServer, fixtureLayer } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";

const atividade: DuckTable = {
  name: "atividade",
  key: "id",
  columns: { id: "VARCHAR", descricao: "VARCHAR", ativo: "BOOLEAN", valor: "DOUBLE" },
  search: ["descricao"],
};

const Hit = Schema.Struct({ id: Schema.String, score: Schema.Finite });

const rows = [
  { id: "1", descricao: "Transporte rodoviário de carga", ativo: true, valor: 10.5 },
  { id: "2", descricao: "Comércio varejista de medicamentos", ativo: false, valor: 3 },
  { id: "3", descricao: "Transporte aéreo de passageiros", ativo: true, valor: null },
];

describe("Duck", () => {
  layer(
    Layer.mergeAll(
      TestDuckLive,
      fixtureLayer([{ match: "/private.json", respond: { body: '[{"secret":"private"}]' } }])
    ),
    { timeout: Duration.seconds(120), excludeTestServices: true }
  )("real DuckDB file", (it) => {
    it.effect("readOnly returns columns, CTEs and capped rows without changing the source", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.replace(atividade, rows);
        const result = yield* duck.readOnly(
          "WITH sample AS (SELECT id, valor FROM atividade) SELECT * FROM sample ORDER BY id;",
          2
        );
        expect(result.linhas).toEqual([
          ["1", 10.5],
          ["2", 3],
        ]);
        expect(result.colunas).toEqual([
          { name: "id", type: "VARCHAR" },
          { name: "valor", type: "DOUBLE" },
        ]);
        const literal = yield* duck.readOnly("SELECT '; SELECT 2' AS literal");
        expect(literal.linhas).toEqual([["; SELECT 2"]]);
        const total = yield* duck.count(atividade);
        expect(total).toBe(3);
      })
    );

    it.effect("readOnly rejects mutations, extra statements, files, network and extensions", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.replace(atividade, rows);
        const server = yield* FixtureServer;
        yield* Effect.forEach(
          [
            "",
            "SELECT",
            "SELECT 1; SELECT 2",
            "SELECT 1; DELETE FROM atividade",
            "DELETE FROM atividade",
            "UPDATE atividade SET valor = 0",
            "INSERT INTO atividade (id) VALUES ('x')",
            "CREATE TABLE invaded (id INTEGER)",
            "DROP TABLE atividade",
            "ALTER TABLE atividade ADD COLUMN stolen VARCHAR",
            "ATTACH '/etc/passwd' AS stolen",
            "INSTALL httpfs",
            "LOAD httpfs",
            "SET enable_external_access=true",
            "PRAGMA enable_external_access=true",
            `COPY atividade TO '${duck.dir}/forbidden.csv'`,
            "SELECT * FROM read_csv('/etc/passwd')",
            "SELECT * FROM read_blob('/etc/passwd')",
            `SELECT * FROM read_json('${server.origin}/private.json')`,
            "SELECT * FROM glob('/etc/*')",
            `SELECT * FROM read_parquet('${server.origin}/private.json')`,
            "SELECT * FROM query('SELECT * FROM read_text(''/etc/passwd'')')",
            "CALL checkpoint()",
            `EXPORT DATABASE '${duck.dir}/forbidden'`,
            "CREATE SECRET stolen (TYPE S3, KEY_ID 'x', SECRET 'x')",
            "SELECT * FROM '/etc/passwd'",
            "SELECT * FROM query('DELETE FROM atividade')",
            "WITH stolen AS (SELECT * FROM read_text('/etc/passwd')) SELECT * FROM stolen",
          ],
          (sql) =>
            Effect.gen(function* () {
              const exit = yield* Effect.exit(duck.readOnly(sql));
              expect({ sql, status: exit._tag }).toEqual({ sql, status: "Failure" });
            }),
          { concurrency: 1 }
        );
        const hits = yield* server.hits("/private.json");
        expect(hits).toBe(0);
        const before = yield* duck.count(atividade);
        expect(before).toBe(3);
        yield* duck.replace(atividade, rows);
        const after = yield* duck.count(atividade);
        expect(after).toBe(3);
      })
    );

    it.effect("readOnly enforces default and maximum row limits, including empty results", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        const defaults = yield* duck.readOnly("SELECT * FROM range(1200)");
        const capped = yield* duck.readOnly("SELECT * FROM range(1200)", 2000);
        const empty = yield* duck.readOnly("SELECT 1 AS id WHERE false");
        expect(defaults.linhas).toHaveLength(200);
        expect(capped.linhas).toHaveLength(1000);
        expect(empty.linhas).toEqual([]);
        expect(empty.colunas).toEqual([{ name: "id", type: "INTEGER" }]);
      })
    );

    it.effect("readOnly interrupts expensive execution and leaves indexing usable", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.run("CREATE OR REPLACE TABLE expensive AS SELECT * FROM range(1000)");
        const exit = yield* Effect.exit(
          duck.readOnly(
            "SELECT sum(a.range * b.range * c.range) FROM expensive a, expensive b, expensive c",
            1,
            10
          )
        );
        expect(exit._tag).toBe("Failure");
        const result = yield* duck.readOnly("SELECT 42 AS answer");
        expect(result.linhas).toEqual([[42]]);
      })
    );

    it.effect("replace loads typed rows and builds the bm25 index", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        const loaded = yield* duck.replace(atividade, rows);
        const total = yield* duck.count(atividade);
        const hits = yield* duck.query(
          Hit,
          `SELECT id, score FROM (SELECT id, ${bm25(atividade)} AS score FROM atividade) WHERE score IS NOT NULL ORDER BY score DESC`,
          ["transporte rodoviario"]
        );
        expect(loaded).toBe(3);
        expect(total).toBe(3);
        expect(hits[0]?.id).toBe("1");
        expect(Arr.map(hits, (hit) => hit.id)).not.toContain("2");
      })
    );

    it.effect("accents and case are folded by the index", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.replace(atividade, rows);
        const hits = yield* duck.query(
          Hit,
          `SELECT id, score FROM (SELECT id, ${bm25(atividade)} AS score FROM atividade) WHERE score IS NOT NULL`,
          ["COMERCIO"]
        );
        expect(Arr.map(hits, (hit) => hit.id)).toEqual(["2"]);
      })
    );

    it.effect("a failing transaction rolls the replace back", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.replace(atividade, rows);
        const exit = yield* Effect.exit(
          duck.transaction(
            duck
              .run("DELETE FROM atividade")
              .pipe(Effect.andThen(duck.run("SELECT * FROM tabela_que_nao_existe")))
          )
        );
        const total = yield* duck.count(atividade);
        expect(exit._tag).toBe("Failure");
        expect(total).toBe(3);
      })
    );

    it.effect("nested transactions join the outer one and roll back together", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        yield* duck.replace(atividade, rows);
        const exit = yield* Effect.exit(
          duck.transaction(
            duck
              .replace(atividade, [rows[0] ?? { id: "x", descricao: "x", ativo: true, valor: 1 }])
              .pipe(Effect.andThen(duck.run("SELECT * FROM tabela_que_nao_existe")))
          )
        );
        const total = yield* duck.count(atividade);
        expect(exit._tag).toBe("Failure");
        expect(total).toBe(3);
      })
    );

    it.effect("an empty replace leaves an empty table, not a missing one", () =>
      Effect.gen(function* () {
        const duck = yield* Duck;
        const loaded = yield* duck.replace({ ...atividade, name: "vazia", search: [] }, []);
        const total = yield* duck.count({ ...atividade, name: "vazia" });
        expect(loaded).toBe(0);
        expect(total).toBe(0);
      })
    );
  });
});
