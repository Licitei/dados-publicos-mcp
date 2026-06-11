import { beforeAll, expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import { findNorma, normas } from "../src/modules/legislacao/catalog";
import { htmlToParagraphs } from "../src/modules/legislacao/indexer";
import {
  buscarLegislacao,
  obterArtigo,
} from "../src/modules/legislacao/service";
import {
  abrirLeitura,
  createSchema,
  gravarIndice,
} from "../src/modules/legislacao/store";

const documentos = [
  {
    norma: normas[0]!,
    paragrafos: [
      "Art.",
      "67. Texto do artigo sessenta e sete.",
      "Paragrafo complementar.",
      "Art.",
      "68. Proximo artigo.",
    ],
  },
];

beforeAll(async () => {
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = await mkdtemp(
    join(tmpdir(), "dados-publicos-mcp-test-"),
  );

  const db = abrirLeitura();
  createSchema(db);
  gravarIndice(db, documentos, new Date().toISOString());
  db.close();
});

test("catalogo expandido cobre normas de licitacao e gerais", () => {
  expect(normas.length).toBeGreaterThanOrEqual(43);
  expect(findNorma("14133")?.id).toBe("lei-14133-2021");
  expect(findNorma("lei das estatais")?.id).toBe("lei-13303-2016");
  expect(findNorma("clt")?.id).toBe("clt-decreto-lei-5452-1943");
  expect(findNorma("cf")?.id).toBe("constituicao-federal-1988");
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
  const result = await obterArtigo({ norma: "14133", artigo: 67 });

  expect(Result.isOk(result)).toBe(true);
  if (Result.isError(result)) return;

  expect(result.value.encontrado).toBe(true);
  expect(result.value.texto).toBe(
    "Art.\n67. Texto do artigo sessenta e sete.\nParagrafo complementar.",
  );
});

test("busca FTS encontra trecho por palavra normalizada", async () => {
  const result = await buscarLegislacao({ termo: "complementar" });

  expect(Result.isOk(result)).toBe(true);
  if (Result.isError(result)) return;

  expect(result.value.length).toBeGreaterThanOrEqual(1);
  const hit = result.value.find((t) => t.trecho.includes("complementar"));
  expect(hit?.norma).toBe("lei-14133-2021");
  expect(hit?.indice).toBe(2);
});

test("busca sem indice retorna erro declarativo INDICE_AUSENTE", async () => {
  const previo = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = await mkdtemp(
    join(tmpdir(), "dados-publicos-mcp-vazio-"),
  );

  const result = await buscarLegislacao({ termo: "qualquer" });

  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = previo;

  expect(Result.isError(result)).toBe(true);
  if (Result.isOk(result)) return;

  expect(result.error.code).toBe("legislacao.INDICE_AUSENTE");
});
