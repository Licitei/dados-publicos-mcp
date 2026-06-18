import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  QueridoDiario,
  QueridoDiarioLive,
} from "../../src/sources/querido-diario/store";
import { EmbedderStub } from "./support/embedder-stub";
import { TestDbLive } from "./support/test-db";

const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
};

const makeZip = (files: { name: string; data: Uint8Array }[], method = 0) => {
  const enc = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const nameBytes = enc.encode(file.name);
    const payload =
      method === 8 ? new Uint8Array(deflateRawSync(file.data)) : file.data;
    const lfh = new DataView(new ArrayBuffer(30));
    lfh.setUint32(0, 0x04034b50, true);
    lfh.setUint16(8, method, true);
    lfh.setUint32(18, payload.length, true);
    lfh.setUint32(22, file.data.length, true);
    lfh.setUint16(26, nameBytes.length, true);
    const local = concat(new Uint8Array(lfh.buffer), nameBytes, payload);
    const cdh = new DataView(new ArrayBuffer(46));
    cdh.setUint32(0, 0x02014b50, true);
    cdh.setUint16(10, method, true);
    cdh.setUint32(20, payload.length, true);
    cdh.setUint32(24, file.data.length, true);
    cdh.setUint16(28, nameBytes.length, true);
    cdh.setUint32(42, offset, true);
    centrals.push(concat(new Uint8Array(cdh.buffer), nameBytes));
    locals.push(local);
    offset += local.length;
  }
  const cd = concat(...centrals);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cd.length, true);
  eocd.setUint32(16, offset, true);
  return concat(...locals, cd, new Uint8Array(eocd.buffer));
};

const enc = (text: string) => new TextEncoder().encode(text);

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

const aggregatesJson = JSON.stringify({
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

const apZip = makeZip(
  [
    { name: "santana_1600600_2025.xml", data: enc(santanaXml) },
    { name: "macapa_1600303_2025.xml", data: enc(macapaXml) },
  ],
  8
);

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("/aggregates/AP/AP_2025.zip")
    ? new Response(apZip)
    : url.includes("/aggregates/AP")
      ? new Response(aggregatesJson, {
          headers: { "content-type": "application/json" },
        })
      : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  QueridoDiarioLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub))
  ),
  TestDbLive,
  EmbedderStub,
  HttpStub
);

const scope = [{ uf: "AP", ano: 2025 }] as const;

const seeded = Effect.gen(function* () {
  const qd = yield* QueridoDiario;
  yield* qd.indexScope(scope);
  return qd;
});

describe("querido-diario store + json/zip/xml ingest", () => {
  it.effect(
    "indexScope parses gazettes, counts diarios + extracted cnpjs",
    () =>
      Effect.gen(function* () {
        const qd = yield* QueridoDiario;
        const total = yield* qd.indexScope(scope);
        expect(total.diarios).toBe(3);
        expect(total.cnpjs).toBe(1);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarDiarios ranks by hybrid RRF (lexical + vec arm) and filters territory",
    () =>
      Effect.gen(function* () {
        const qd = yield* seeded;
        const lexical = yield* qd.buscarDiarios("pavimentacao asfaltica");
        expect(lexical.length).toBeGreaterThan(0);
        expect(lexical.map((r) => r.territoryId)).toContain("1600600");
        expect(Number(lexical[0].score)).toBeGreaterThan(0);
        const semLexical = yield* qd.buscarDiarios(
          "zzzz termo sem correspondencia lexical"
        );
        expect(semLexical.length).toBeGreaterThan(0);
        const filtrado = yield* qd.buscarDiarios("concurso", {
          territoryId: "1600600",
        });
        expect(filtrado.length).toBeGreaterThan(0);
        expect(filtrado.every((r) => r.territoryId === "1600600")).toBe(true);
        const outro = yield* qd.buscarDiarios("medicamentos", {
          territoryId: "1600600",
        });
        expect(outro.every((r) => r.territoryId === "1600600")).toBe(true);
        const missing = yield* Effect.flip(qd.buscarDiarios("   "));
        expect(missing._tag).toBe("QueridoDiarioError");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "diariosPorMunicipio lists a municipio's gazettes ordered by date desc",
    () =>
      Effect.gen(function* () {
        const qd = yield* seeded;
        const rows = yield* qd.diariosPorMunicipio("1600600");
        expect(rows.length).toBe(2);
        expect(rows.every((r) => r.territoryId === "1600600")).toBe(true);
        expect(rows[0].data).toBe("2025-01-20");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarCnpjEmDiario finds the gazette by its extracted cnpj",
    () =>
      Effect.gen(function* () {
        const qd = yield* seeded;
        const found = yield* qd.buscarCnpjEmDiario("44.555.666/0001-99");
        expect(found.length).toBe(1);
        expect(found[0].cnpj).toBe("44555666000199");
        expect(found[0].diario.municipio).toBe("Santana");
        const none = yield* qd.buscarCnpjEmDiario("00.000.000/0000-00");
        expect(none.length).toBe(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
