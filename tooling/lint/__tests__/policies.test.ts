import { describe, expect, it } from "vitest";
import { API } from "tsrs/async";

import { detectClones } from "../reuse-policy.ts";
import { shapeViolations } from "../source-policy.ts";

const block = (name: string) =>
  Array.from(
    { length: 30 },
    (_, index) =>
      `export const ${name}${index} = (input: string) => input.trim().toUpperCase() + ${index};`
  ).join("\n");

describe("reuse-policy clone detector", () => {
  it("reports a duplicated block across files above the window", () => {
    const shared = block("same");
    const result = detectClones(
      [
        { path: "src/a.ts", source: `${shared}\nexport const onlyA = 1;` },
        { path: "src/b.ts", source: `export const onlyB = 2;\n${shared}` },
      ],
      50
    );
    expect(result.blocks.length).toBeGreaterThan(0);
    expect(result.ratio).toBeGreaterThan(0.5);
  });

  it("reports nothing for distinct files", () => {
    const result = detectClones(
      [
        { path: "src/a.ts", source: block("alpha") },
        {
          path: "src/b.ts",
          source: Array.from(
            { length: 30 },
            (_, i) => `export const beta${i} = ${i} * ${i + 1};`
          ).join("\n"),
        },
      ],
      50
    );
    expect(result.blocks).toEqual([]);
    expect(result.ratio).toBe(0);
  });
});

describe("source-policy handwritten shapes", () => {
  const violationsOf = async (source: string) => {
    await using api = new API();
    await using retained = await api.createSourceFile("/virtual/sample.ts", source);
    return shapeViolations(retained.sourceFile).map((violation) => violation.message);
  };

  it("flags handwritten object types and interfaces", async () => {
    expect(await violationsOf("type Row = { id: string };")).toHaveLength(1);
    expect(await violationsOf("interface Row { id: string }")).toHaveLength(1);
    expect(await violationsOf("type Rows = ReadonlyArray<{ id: string }>;")).toHaveLength(1);
    expect(await violationsOf("type Both = Base & { extra: string };")).toHaveLength(1);
  });

  it("allows Schema-derived and inferred types", async () => {
    expect(await violationsOf('type Row = (typeof Row)["Type"];')).toEqual([]);
    expect(await violationsOf("type Shape = Effect.Success<typeof make>;")).toEqual([]);
    expect(await violationsOf("type Code = 'a' | 'b';")).toEqual([]);
  });
});
