import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import {
  TransparenciaDespesas,
  TransparenciaDespesasLive,
} from "../../src/sources/transparencia-despesas/store";
import { TestDbLive } from "./support/test-db";

const crcTable = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>(
    (c) => ((c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1),
    n
  )
);

const crc32 = (bytes: Uint8Array) =>
  (bytes.reduce(
    (crc, byte) => (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff],
    0xffffffff
  ) ^
    0xffffffff) >>>
  0;

type ZipEntry = { readonly name: string; readonly bytes: Uint8Array };

const storedZip = (entries: readonly ZipEntry[]) => {
  const encoder = new TextEncoder();
  const local = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint32(14, crc32(entry.bytes), true);
    view.setUint32(18, entry.bytes.length, true);
    view.setUint32(22, entry.bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    header.set(nameBytes, 30);
    return { nameBytes, header, data: entry.bytes };
  });
  const offsets = local.reduce<readonly number[]>(
    (acc, part) => [
      ...acc,
      (acc[acc.length - 1] ?? 0) + part.header.length + part.data.length,
    ],
    [0]
  );
  const central = local.map((part, index) => {
    const header = new Uint8Array(46 + part.nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint32(16, crc32(part.data), true);
    view.setUint32(20, part.data.length, true);
    view.setUint32(24, part.data.length, true);
    view.setUint16(28, part.nameBytes.length, true);
    view.setUint32(42, offsets[index], true);
    header.set(part.nameBytes, 46);
    return header;
  });
  const centralSize = central.reduce((sum, header) => sum + header.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, 0x06054b50, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offsets[offsets.length - 1], true);
  const chunks = [
    ...local.flatMap((part) => [part.header, part.data]),
    ...central,
    eocd,
  ];
  const out = new Uint8Array(chunks.reduce((sum, c) => sum + c.length, 0));
  chunks.reduce((position, chunk) => {
    out.set(chunk, position);
    return position + chunk.length;
  }, 0);
  return out;
};

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));

const despesasCsv = [
  "Ano e mes do lancamento;Codigo Orgao Superior;Nome Orgao Superior;Codigo Orgao Subordinado;Nome Orgao Subordinado;Codigo Funcao;Nome Funcao;Codigo Programa Orcamentario;Nome Programa Orcamentario;Codigo Acao;Nome Acao;UF;Municipio;Nome Elemento de Despesa;Valor Empenhado (R$);Valor Liquidado (R$);Valor Pago (R$)",
  "2024/01;35000;Ministerio das Relacoes Exteriores;35101;MRE Unidades;07;Relacoes exteriores;2216;POLITICA EXTERNA;20WX;RELACOES E NEGOCIACOES MULTILATERAIS;DF;BRASILIA;Diarias;1000000,00;800000,00;750000,00",
  "2024/01;26000;Ministerio da Educacao;26298;Universidade X;12;Educacao;2080;EDUCACAO SUPERIOR;20RK;FUNCIONAMENTO CAMPI;SP;SAO PAULO;Equipamentos;5000000,00;3000000,00;2500000,00",
].join("\r\n");

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("202401_Despesas.zip")
    ? new Response(
        storedZip([{ name: "202401_Despesas.csv", bytes: latin1(despesasCsv) }])
      )
    : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  TransparenciaDespesasLive.pipe(
    Layer.provide(Layer.mergeAll(TestDbLive, HttpStub))
  ),
  TestDbLive,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const td = yield* TransparenciaDespesas;
  yield* td.indexMes("2024-01");
  return td;
});

describe("transparencia-despesas store + zip/csv ingest", () => {
  it.effect(
    "indexes a month of federal budget execution",
    () =>
      Effect.gen(function* () {
        const td = yield* TransparenciaDespesas;
        const result = yield* td.indexMes("2024-01");
        expect(result.anoMes).toBe("202401");
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarDespesa by ação (bm25) and despesasPorOrgao by code",
    () =>
      Effect.gen(function* () {
        const td = yield* seeded;
        const hits = yield* td.buscarDespesa("relacoes negociacoes multilaterais");
        expect(hits.map((r) => r.codOrgaoSuperior)).toContain("35000");
        expect(Number(hits[0].score)).toBeLessThan(0);
        const orgao = yield* td.despesasPorOrgao("35000", 10);
        expect(orgao).toHaveLength(1);
        expect(Number(orgao[0].valorPago)).toBeCloseTo(750000, 0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarDespesa honors the uf filter",
    () =>
      Effect.gen(function* () {
        const td = yield* seeded;
        const sp = yield* td.buscarDespesa("educacao superior campi", { uf: "SP" });
        expect(sp.map((r) => r.codOrgaoSuperior)).toEqual(["26000"]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
