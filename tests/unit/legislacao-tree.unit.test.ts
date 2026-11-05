import { describe, expect, it } from "@effect/vitest";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Order from "effect/Order";
import * as Str from "effect/String";
import { buildTree } from "../../src/sources/legislacao/catalog";

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
  const at = (path: string) => Arr.findFirst(nodes, (node) => node.path === path);

  it("roots the tree at the norma", () => {
    expect(Arr.head(nodes)).toEqual(
      Option.some(
        expect.objectContaining({
      path: "lei_14133_2021",
      parentPath: null,
      kind: "norma",
        })
      )
    );
  });

  it("nests título → capítulo → artigo with ltree paths", () => {
    expect(Option.isSome(at("lei_14133_2021.tit_ii"))).toBe(true);
    expect(Option.isSome(at("lei_14133_2021.tit_ii.cap_i"))).toBe(true);
    const artigo = at("lei_14133_2021.tit_ii.cap_i.art17");
    expect(Option.map(artigo, (n) => n.kind)).toEqual(Option.some("artigo"));
    expect(Option.map(artigo, (n) => n.label)).toEqual(Option.some("Art. 17"));
    expect(Option.map(artigo, (n) => n.text)).toEqual(
      Option.some("O processo de licitação observará as seguintes fases:")
    );
  });

  it("attaches container titles as text", () => {
    expect(Option.map(at("lei_14133_2021.tit_ii"), (n) => n.text)).toEqual(
      Option.some("Das Licitações")
    );
  });

  it("nests incisos and paragraphs under the article", () => {
    const incisoI = at("lei_14133_2021.tit_ii.cap_i.art17.inc_i");
    expect(Option.map(incisoI, (n) => n.kind)).toEqual(Option.some("inciso"));
    expect(Option.map(incisoI, (n) => n.text)).toEqual(
      Option.some("preparatória;")
    );
    expect(
      Option.map(at("lei_14133_2021.tit_ii.cap_i.art17.p1"), (n) => n.label)
    ).toEqual(Option.some("§ 1"));
    expect(
      Option.map(at("lei_14133_2021.tit_ii.cap_i.art17.pu"), (n) => n.kind)
    ).toEqual(Option.some("paragrafo"));
  });

  it("subtree membership follows ltree ancestry", () => {
    const underArt17 = Arr.filter(nodes, (node) =>
      Str.startsWith("lei_14133_2021.tit_ii.cap_i.art17.")(node.path)
    );
    expect(Arr.sort(Arr.map(underArt17, (n) => n.kind), Order.String)).toEqual([
      "inciso",
      "inciso",
      "paragrafo",
      "paragrafo",
    ]);
  });

  it("starts a fresh article subtree for Art. 18", () => {
    const alinea = at("lei_14133_2021.tit_ii.cap_i.art18.ali_a");
    expect(Option.map(alinea, (n) => n.kind)).toEqual(Option.some("alinea"));
    expect(Option.map(alinea, (n) => n.text)).toEqual(
      Option.some("o objeto da contratação;")
    );
  });
});
