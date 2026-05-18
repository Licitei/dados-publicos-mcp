import { expect, test } from "bun:test";
import { findNorma } from "../src/catalog";
import { htmlToParagraphs } from "../src/parser";

test("encontra norma por apelido", () => {
  expect(findNorma("14133")?.id).toBe("lei-14133-2021");
  expect(findNorma("lei das estatais")?.id).toBe("lei-13303-2016");
});

test("converte html do planalto em paragrafos pesquisaveis", () => {
  const paragrafos = htmlToParagraphs(`
    <html>
      <body>
        <p>Art. 67. A documentacao relativa a qualificacao tecnico-profissional.</p>
        <p>&sect; 1&ordm; Texto complementar.</p>
      </body>
    </html>
  `);

  expect(paragrafos).toEqual([
    "Art. 67. A documentacao relativa a qualificacao tecnico-profissional.",
    "§ 1º Texto complementar.",
  ]);
});
