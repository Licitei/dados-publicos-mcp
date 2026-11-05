import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Option from "effect/Option";
import { QueridoDiario, QueridoDiarioLive } from "../../src/sources/querido-diario/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const santanaXml = `<?xml version="1.0" encoding="utf-8"?>
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
        <url_arquivo_original>http://diario/santana/1.pdf</url_arquivo_original>
        <poder>executive</poder>
        <edicao_extra>Nao</edicao_extra>
        <numero_edicao>123</numero_edicao>
        <data_publicacao>15/01/2025</data_publicacao>
      </meta_diario>
      <conteudo><![CDATA[Extrato de contrato de pavimenta&#231;&#227;o asf&#225;ltica de vias urbanas. Contratada GRAFICA BETA LTDA inscrita no CNPJ 44.555.666/0001-99 para servicos de impressao.]]></conteudo>
    </diario>
    <diario>
      <meta_diario>
        <url_arquivo_original>http://diario/santana/2.pdf</url_arquivo_original>
        <poder>executive</poder>
        <edicao_extra>Sim</edicao_extra>
        <numero_edicao>124</numero_edicao>
        <data_publicacao>20/01/2025</data_publicacao>
      </meta_diario>
      <conteudo>Nomeacao de servidores e concurso publico do magisterio municipal.</conteudo>
    </diario>
  </diarios>
</root>`;

const macapaXml = `<?xml version="1.0" encoding="utf-8"?>
<root>
  <meta>
    <uf>AP</uf>
    <ano_publicacao>2025</ano_publicacao>
    <municipio>Macapa</municipio>
    <municipio_codigo_ibge>1600303</municipio_codigo_ibge>
  </meta>
  <diarios>
    <diario>
      <meta_diario>
        <url_arquivo_original>http://diario/macapa/1.pdf</url_arquivo_original>
        <poder>executive</poder>
        <edicao_extra>Nao</edicao_extra>
        <numero_edicao>500</numero_edicao>
        <data_publicacao>10/02/2025</data_publicacao>
      </meta_diario>
      <conteudo>Licitacao para aquisicao de medicamentos e insumos hospitalares da rede de saude.</conteudo>
    </diario>
  </diarios>
</root>`;

const toJson = (value: unknown) =>
  Schema.encodeUnknownOption(Schema.fromJsonString(Schema.Unknown))(value).pipe(
    Option.getOrElse(() => "")
  );

const aggregatesJson = toJson({
  aggregates: [
    {
      territory_id: "1600600",
      state_code: "AP",
      file_path: "data.queridodiario.ok.org.braggregates/AP/AP_2025.zip",
      year: 2025,
      last_updated: "2025-06-01",
      hash_info: "abc",
      file_size_mb: 1.2,
    },
  ],
});

const apZip = storedZip([
  { name: "santana_1600600_2025.xml", bytes: utf8(santanaXml) },
  { name: "macapa_1600303_2025.xml", bytes: utf8(macapaXml) },
]);

const HttpFixture = fixtureLayer([
  { match: pathIncludes("/aggregates/AP/AP_2025.zip"), respond: { body: apZip } },
  {
    match: pathIncludes("/aggregates/AP"),
    respond: {
      body: aggregatesJson,
      headers: { "content-type": "application/json" },
    },
  },
]);

const Infra = Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture);

const TestLayer = QueridoDiarioLive.pipe(Layer.provideMerge(Infra));

const scope = [{ uf: "AP", ano: 2025 }] as const;

layer(TestLayer, { timeout: Duration.seconds(120), excludeTestServices: true })(
  "querido-diario store + json/zip/xml ingest",
  (it) => {
    it.effect("indexScope parses gazettes, counts diarios + extracted cnpjs", () =>
      Effect.gen(function* () {
        const qd = yield* QueridoDiario;
        const total = yield* qd.indexScope(scope);
        expect(total.diarios).toBe(3);
        expect(total.cnpjs).toBe(1);
      })
    );
  }
);
