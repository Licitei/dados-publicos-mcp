import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  Transferegov,
  TransferegovLive,
} from "../../src/sources/transferegov/store";

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

const utf8 = (text: string) => new TextEncoder().encode(text);

const propostaCsv = [
  "ID_PROPOSTA;UF_PROPONENTE;MUNIC_PROPONENTE;COD_MUNIC_IBGE;DESC_ORGAO_SUP;DESC_ORGAO;MODALIDADE;IDENTIF_PROPONENTE;NM_PROPONENTE;OBJETO_PROPOSTA",
  "73142;SP;BARRA DO TURVO;3505401;MINISTERIO DA CIDADANIA;FUNDO NACIONAL;CONTRATO DE REPASSE;46634317000180;MUNICIPIO DE BARRA DO TURVO;Construcao de Centro de Referencia de Assistencia Social CRAS",
  "87118;RJ;MARICA;3302700;MINISTERIO DO ESPORTE;SECRETARIA;CONVENIO;11222333000181;ASSOCIACAO BETA;Reforma de quadra poliesportiva municipal",
].join("\r\n");

const convenioCsv = [
  "NR_CONVENIO;ID_PROPOSTA;SIT_CONVENIO;DIA_PUBL_CONV;DIA_INIC_VIGENC_CONV;DIA_FIM_VIGENC_CONV;VL_GLOBAL_CONV;VL_REPASSE_CONV",
  "724072;73142;Prestacao de Contas Aprovada;31/12/2009;05/01/2010;05/01/2011;106392,38;98200,00",
  "800000;87118;Em execucao;10/02/2020;15/02/2020;15/02/2022;250000,00;240000,00",
].join("\r\n");

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes("siconv_proposta")
    ? new Response(storedZip([{ name: "siconv_proposta.csv", bytes: utf8(propostaCsv) }]))
    : url.includes("siconv_convenio")
      ? new Response(storedZip([{ name: "siconv_convenio.csv", bytes: utf8(convenioCsv) }]))
      : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  TransferegovLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const tg = yield* Transferegov;
  yield* tg.index;
  return tg;
});

describe("transferegov store + zip/csv ingest", () => {
  it.effect(
    "merges convenio with proposta enrichment on ID_PROPOSTA",
    () =>
      Effect.gen(function* () {
        const tg = yield* Transferegov;
        const result = yield* tg.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "conveniosDoProponente sums repasse and carries the joined objeto/CNPJ",
    () =>
      Effect.gen(function* () {
        const tg = yield* seeded;
        const prop = yield* tg.conveniosDoProponente("46.634.317/0001-80");
        expect(prop.docNormalizado).toBe("46634317000180");
        expect(prop.count).toBe(1);
        expect(prop.totalRepasse).toBeCloseTo(98200, 0);
        expect(prop.convenios[0].objeto).toContain("Centro de Referencia");
        expect(prop.convenios[0].municipio).toBe("BARRA DO TURVO");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarConvenio by objeto (bm25) and conveniosDoMunicipio by IBGE code",
    () =>
      Effect.gen(function* () {
        const tg = yield* seeded;
        const hits = yield* tg.buscarConvenio("centro referencia assistencia");
        expect(hits.map((r) => r.nrConvenio)).toContain("724072");
        const muni = yield* tg.conveniosDoMunicipio("3302700", 10);
        expect(muni.map((r) => r.nrConvenio)).toEqual(["800000"]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
