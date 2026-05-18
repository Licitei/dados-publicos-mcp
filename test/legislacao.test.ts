import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Result } from "better-result";
import dayjs from "dayjs";
import { findNorma, normas } from "../src/modules/legislacao/catalog";
import { htmlToParagraphs } from "../src/modules/legislacao/indexer";
import { obterArtigo } from "../src/modules/legislacao/service";
import { saveIndex } from "../src/modules/legislacao/store";

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

test("obtem artigo quando Art. e numero estao em paragrafos separados", async () => {
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = await mkdtemp(
    join(tmpdir(), "dados-publicos-mcp-test-")
  );

  const norma = normas[0];
  const saved = await saveIndex({
    versao: 1,
    criadoEm: dayjs().toISOString(),
    fonte: "planalto",
    documentos: [
      {
        norma,
        paragrafos: [
          "Art.",
          "67. Texto do artigo sessenta e sete.",
          "Paragrafo complementar.",
          "Art.",
          "68. Proximo artigo.",
        ],
      },
    ],
  });

  expect(Result.isOk(saved)).toBe(true);

  const result = await obterArtigo({ norma: "14133", artigo: 67 });

  expect(Result.isOk(result)).toBe(true);
  if (Result.isError(result)) return;

  expect(result.value.encontrado).toBe(true);
  expect("texto" in result.value).toBe(true);
  if (!("texto" in result.value)) return;

  expect(result.value.texto).toBe(
    "Art.\n67. Texto do artigo sessenta e sete.\nParagrafo complementar."
  );
});
