import { describe, expect, it } from "@effect/vitest";
import { Effect } from "effect";
import { tablesHash, tablesText } from "../../infra/schema-hash";
import type { DuckTable } from "../../src/kernel/duck/duck";

const base: DuckTable = {
  name: "cnae",
  key: "id",
  columns: { id: "VARCHAR", descricao: "VARCHAR" },
  search: ["descricao"],
};

describe("tablesHash", () => {
  it.effect("is a stable 64-hex digest of the declared tables", () =>
    Effect.gen(function* () {
      const first = yield* tablesHash([base]);
      const second = yield* tablesHash([base]);
      expect(first).toMatch(/^[0-9a-f]{64}$/);
      expect(first).toEqual(second);
    })
  );

  it.effect("changes when a column, its type or the search columns change", () =>
    Effect.gen(function* () {
      const original = yield* tablesHash([base]);
      const added = yield* tablesHash([{ ...base, columns: { ...base.columns, uf: "VARCHAR" } }]);
      const retyped = yield* tablesHash([
        { ...base, columns: { ...base.columns, descricao: "JSON" } },
      ]);
      const research = yield* tablesHash([{ ...base, search: [] }]);
      expect(new Set([original, added, retyped, research]).size).toBe(4);
    })
  );

  it("renders every table, key, search column and typed column", () => {
    expect(tablesText([base])).toBe("cnae(id)[descricao]{id:VARCHAR,descricao:VARCHAR}");
  });
});
