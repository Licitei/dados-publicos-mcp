import { describe, expect, it } from "@effect/vitest";
import { buildTree } from "../src/sources/legislacao/tree";

const norma = { id: "lei-14133-2021", titulo: "Lei 14.133/2021" };

const lines = [
  "TÍTULO II",
  "Das Licitações",
  "CAPÍTULO I",
  "Do Processo Licitatório",
  "Art. 17. O processo de licitação observará as seguintes fases:",
  "I - preparatória;",
  "II - de divulgação do edital;",
  "§ 1º A fase preparatória é caracterizada pelo planejamento.",
  "Parágrafo único. Aplica-se o disposto neste artigo.",
  "Art. 18. A fase preparatória abrange:",
  "a) o objeto da contratação;",
];

describe("legislacao tree parser", () => {
  const nodes = buildTree(norma, lines);
  const byPath = new Map(nodes.map((node) => [node.path, node]));

  it("roots the tree at the norma", () => {
    expect(nodes[0]).toMatchObject({
      path: "lei_14133_2021",
      parentPath: null,
      kind: "norma",
    });
  });

  it("nests título → capítulo → artigo with ltree paths", () => {
    expect(byPath.has("lei_14133_2021.tit_ii")).toBe(true);
    expect(byPath.has("lei_14133_2021.tit_ii.cap_i")).toBe(true);
    const artigo = byPath.get("lei_14133_2021.tit_ii.cap_i.art17");
    expect(artigo?.kind).toBe("artigo");
    expect(artigo?.label).toBe("Art. 17");
    expect(artigo?.text).toBe(
      "O processo de licitação observará as seguintes fases:"
    );
  });

  it("attaches container titles as text", () => {
    expect(byPath.get("lei_14133_2021.tit_ii")?.text).toBe("Das Licitações");
  });

  it("nests incisos and paragraphs under the article", () => {
    const incisoI = byPath.get("lei_14133_2021.tit_ii.cap_i.art17.inc_i");
    expect(incisoI?.kind).toBe("inciso");
    expect(incisoI?.text).toBe("preparatória;");
    expect(byPath.get("lei_14133_2021.tit_ii.cap_i.art17.p1")?.label).toBe("§ 1");
    expect(byPath.get("lei_14133_2021.tit_ii.cap_i.art17.pu")?.kind).toBe(
      "paragrafo"
    );
  });

  it("subtree membership follows ltree ancestry", () => {
    const underArt17 = nodes.filter((node) =>
      node.path.startsWith("lei_14133_2021.tit_ii.cap_i.art17.")
    );
    expect(underArt17.map((n) => n.kind).sort()).toEqual([
      "inciso",
      "inciso",
      "paragrafo",
      "paragrafo",
    ]);
  });

  it("starts a fresh article subtree for Art. 18", () => {
    const alinea = byPath.get("lei_14133_2021.tit_ii.cap_i.art18.ali_a");
    expect(alinea?.kind).toBe("alinea");
    expect(alinea?.text).toBe("o objeto da contratação;");
  });
});
