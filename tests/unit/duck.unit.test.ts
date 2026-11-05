import { describe, expect, layer } from "@effect/vitest";
import { Duration, Effect, Schema } from "effect";
import * as Arr from "effect/Array";
import { bm25, Duck, type DuckTable } from "../../src/kernel/duck/duck";
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
  layer(TestDuckLive, { timeout: Duration.seconds(120), excludeTestServices: true })(
    "real DuckDB file",
    (it) => {
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
    }
  );
});
