import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { expect, test } from "bun:test";
import {
  buildAggregateZipUrl,
  buildAggregatesApiUrl,
} from "../src/modules/querido-diario/catalog";
import {
  conteudoParaFts,
  decodeXmlText,
  extractCnpjs,
  extractCpfs,
  parseMeta,
  parseMunicipioXml,
  parseSimNao,
} from "../src/modules/querido-diario/parse";
import { createSchema, insertDiarios } from "../src/modules/querido-diario/store";
import {
  buscarCnpjEmDiario,
  buscarDiarios,
  diariosPorMunicipio,
  toFtsMatch,
} from "../src/modules/querido-diario/service";

// --- Fixture: 1 XML de municipio com 2 diarios (estrutura verificada do QD) ---
const xmlFixture = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <meta>
    <uf>AP</uf>
    <ano_publicacao>2025</ano_publicacao>
    <municipio>Santana</municipio>
    <municipio_codigo_ibge>1600600</municipio_codigo_ibge>
  </meta>
  <diarios>
    <diario>
      <meta_diario>
        <url_arquivo_original>https://example.gov/diario1.pdf</url_arquivo_original>
        <poder>executive</poder>
        <edicao_extra>Nao</edicao_extra>
        <numero_edicao>101</numero_edicao>
        <data_publicacao>15/01/2025</data_publicacao>
      </meta_diario>
      <conteudo><![CDATA[AVISO DE LICITACAO. Pregao Eletronico 005/2025. Vencedora ALPHA COMERCIO LTDA CNPJ 12.345.678/0001-90 para fornecimento de material.]]></conteudo>
    </diario>
    <diario>
      <meta_diario>
        <url_arquivo_original>https://example.gov/diario2.pdf</url_arquivo_original>
        <poder>legislative</poder>
        <edicao_extra>Sim</edicao_extra>
        <numero_edicao>102</numero_edicao>
        <data_publicacao>20/02/2025</data_publicacao>
      </meta_diario>
      <conteudo>DISPENSA DE LICITACAO. Contratada BETA SERVICOS &amp; CIA, CPF do socio 123.456.789-00, objeto manutencao predial.</conteudo>
    </diario>
  </diarios>
</root>`;

test("parseMeta le uf, ano, municipio e codigo IBGE", () => {
  const meta = parseMeta(xmlFixture);

  expect(meta).toEqual({
    uf: "AP",
    ano: 2025,
    municipio: "Santana",
    territoryId: "1600600",
  });
});

test("parseMunicipioXml extrai 2 diarios com data normalizada e edicao_extra", () => {
  const registros = parseMunicipioXml(xmlFixture);

  expect(registros).toHaveLength(2);

  const [d1, d2] = registros;

  expect(d1.data).toBe("2025-01-15"); // dd/mm/aaaa -> aaaa-mm-dd
  expect(d1.poder).toBe("executive");
  expect(d1.edicao).toBe("101");
  expect(d1.edicaoExtra).toBe(false);
  expect(d1.urlOriginal).toBe("https://example.gov/diario1.pdf");
  expect(d1.territoryId).toBe("1600600");
  expect(d1.conteudo).toContain("ALPHA COMERCIO LTDA");

  expect(d2.data).toBe("2025-02-20");
  expect(d2.poder).toBe("legislative");
  expect(d2.edicaoExtra).toBe(true);
  expect(d2.conteudo).toContain("BETA SERVICOS & CIA"); // entidade &amp; decodificada
});

test("decodeXmlText decodifica entidades e CDATA", () => {
  expect(decodeXmlText("a &amp; b &lt;c&gt; &#65;")).toBe("a & b <c> A");
  expect(decodeXmlText("<![CDATA[texto puro]]>")).toBe("texto puro");
});

test("parseSimNao tolera caixa e acento", () => {
  expect(parseSimNao("Sim")).toBe(true);
  expect(parseSimNao("SIM")).toBe(true);
  expect(parseSimNao("Nao")).toBe(false);
  expect(parseSimNao(null)).toBe(false);
});

test("extractCnpjs captura CNPJ com mascara e devolve so digitos", () => {
  expect(extractCnpjs("empresa CNPJ 12.345.678/0001-90 venceu")).toEqual([
    "12345678000190",
  ]);
  expect(extractCnpjs("sem cnpj aqui")).toEqual([]);
});

test("extractCpfs captura CPF mascarado", () => {
  expect(extractCpfs("socio CPF 123.456.789-00 responsavel")).toEqual([
    "12345678900",
  ]);
});

test("toFtsMatch normaliza e cita cada token (tolerante a acento)", () => {
  expect(toFtsMatch("Licitação Pregão")).toBe('"licitacao" "pregao"');
  expect(toFtsMatch("   ")).toBe('""');
});

test("conteudoParaFts remove acento e baixa caixa", () => {
  expect(conteudoParaFts("Pregão Eletrônico")).toBe("pregao eletronico");
});

// --- DB :memory: populado a mao para testar as 3 buscas ---
function memDb(): Database {
  const db = new Database(":memory:");

  createSchema(db);
  insertDiarios(db, parseMunicipioXml(xmlFixture));

  return db;
}

test("createSchema + insertDiarios populam diarios, FTS e CNPJs", () => {
  const db = memDb();

  const diarios = db.query("SELECT COUNT(*) c FROM diarios").get() as {
    c: number;
  };
  const cnpjs = db.query("SELECT COUNT(*) c FROM diario_cnpjs").get() as {
    c: number;
  };

  expect(diarios.c).toBe(2);
  expect(cnpjs.c).toBe(1); // so o diario 1 tem CNPJ valido

  db.close();
});

test("buscarDiarios encontra por termo do conteudo, tolerante a acento", () => {
  const db = memDb();

  // Busca com acento deve casar com texto OCR sem acento (e vice-versa).
  const res = buscarDiarios(db, { termo: "licitação" });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value.length).toBe(2);
    expect(res.value[0].trecho.length).toBeGreaterThan(0);
  }

  db.close();
});

test("buscarDiarios filtra por uf e periodo", () => {
  const db = memDb();

  const res = buscarDiarios(db, {
    termo: "licitacao",
    uf: "AP",
    dataInicial: "2025-02-01",
    dataFinal: "2025-02-28",
  });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(1);
    expect(res.value[0].data).toBe("2025-02-20");
  }

  db.close();
});

test("buscarDiarios por nome de empresa", () => {
  const db = memDb();

  const res = buscarDiarios(db, { termo: "alpha comercio" });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(1);
    expect(res.value[0].edicao).toBe("101");
  }

  db.close();
});

test("buscarCnpjEmDiario acha o diario que cita o CNPJ", () => {
  const db = memDb();

  const res = buscarCnpjEmDiario(db, { cnpj: "12.345.678/0001-90" });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(1);
    expect(res.value[0].territoryId).toBe("1600600");
  }

  db.close();
});

test("buscarCnpjEmDiario rejeita CNPJ invalido", () => {
  const db = memDb();

  const res = buscarCnpjEmDiario(db, { cnpj: "123" });

  expect(Result.isError(res)).toBe(true);

  if (Result.isError(res)) {
    expect(res.error.code).toBe("querido-diario.CNPJ_INVALIDO");
  }

  db.close();
});

test("diariosPorMunicipio sem termo lista todos do IBGE por data desc", () => {
  const db = memDb();

  const res = diariosPorMunicipio(db, { territoryId: "1600600" });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(2);
    expect(res.value[0].data).toBe("2025-02-20"); // mais recente primeiro
    expect(res.value[1].data).toBe("2025-01-15");
  }

  db.close();
});

test("diariosPorMunicipio com termo usa FTS dentro do municipio", () => {
  const db = memDb();

  const res = diariosPorMunicipio(db, {
    territoryId: "1600600",
    termo: "dispensa",
  });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(1);
    expect(res.value[0].edicao).toBe("102");
  }

  db.close();
});

test("diariosPorMunicipio nao vaza outros municipios", () => {
  const db = memDb();

  const res = diariosPorMunicipio(db, { territoryId: "9999999" });

  expect(Result.isOk(res)).toBe(true);

  if (Result.isOk(res)) {
    expect(res.value).toHaveLength(0);
  }

  db.close();
});

test("buildAggregateZipUrl reconstroi a URL (caveat do file_path com bug)", () => {
  expect(buildAggregateZipUrl("SP", 2025)).toBe(
    "https://data.queridodiario.ok.org.br/aggregates/SP/SP_2025.zip"
  );
  expect(buildAggregatesApiUrl("sp")).toBe(
    "https://api.queridodiario.ok.org.br/aggregates/SP"
  );
});
