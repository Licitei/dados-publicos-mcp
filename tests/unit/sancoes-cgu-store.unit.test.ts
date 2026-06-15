import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  SancoesCgu,
  SancoesCguLive,
} from "../../src/sources/sancoes-cgu/store";

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

const latin1 = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));

const yyyymmdd = (millis: number, offset: number) => {
  const date = new Date(millis - offset * 86_400_000);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  return `${year}${month}${day}`;
};

const testClockMillis = 0;
const snapshotDate = yyyymmdd(testClockMillis, 2);
const beforeDate = yyyymmdd(testClockMillis, 1);

const ceisCsv = [
  '"CODIGO DA SANCAO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"RAZAO SOCIAL - CADASTRO RECEITA";"CATEGORIA DA SANCAO";"NUMERO DO PROCESSO";"DATA INICIO SANCAO";"DATA FINAL SANCAO";"ORGAO SANCIONADOR";"UF ORGAO SANCIONADOR";"FUNDAMENTACAO LEGAL"',
  '"S1";"J";"11.222.333/0001-81";"EMPRESA ALPHA LTDA";"ALPHA SERVIÇOS LTDA";"Inidônea";"PROC-1";"01/01/2023";"31/12/2025";"CGU";"DF";"Lei 8.666"',
  '"S2";"F";"111.222.333-44";"JOÃO DA SILVA";"";"Suspensa";"PROC-2";"01/06/2020";"01/06/2022";"TCU";"SP";"Lei 8.666"',
].join("\r\n");

const ceisZip = makeZip(
  [{ name: `${snapshotDate}_CEIS.csv`, data: latin1(ceisCsv) }],
  8
);

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  return url.includes(`${snapshotDate}_CEIS.zip`)
    ? new Response(ceisZip)
    : new Response("nao encontrado", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  SancoesCguLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const sancoes = yield* SancoesCgu;
  yield* sancoes.index;
  return sancoes;
});

describe("sancoes-cgu store + date-regression + zip/csv ingest", () => {
  it.effect(
    "regresses dates to the CEIS snapshot and skips datasets with no file",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* SancoesCgu;
        const result = yield* sancoes.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
        expect(beforeDate).not.toBe(snapshotDate);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "verificar matches all rows by normalized document, by cnpj or cpf",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const porCnpj = yield* sancoes.verificar("11.222.333/0001-81");
        expect(porCnpj.docNormalizado).toBe("11222333000181");
        expect(porCnpj.tipoDocumento).toBe("cnpj");
        expect(porCnpj.sancionado).toBe(true);
        expect(porCnpj.inidoneoOuImpedido).toBe(true);
        expect(porCnpj.total).toBe(1);
        expect(porCnpj.porLista).toEqual({ ceis: 1 });
        expect(porCnpj.sancoes[0].nome).toBe("EMPRESA ALPHA LTDA");
        const porCpf = yield* sancoes.verificar("111.222.333-44");
        expect(porCpf.tipoDocumento).toBe("cpf");
        expect(porCpf.sancoes[0].nome).toBe("JOÃO DA SILVA");
        const ausente = yield* sancoes.verificar("00000000000000");
        expect(ausente.sancionado).toBe(false);
        expect(ausente.total).toBe(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarPorNome matches by bm25 name, falls back to trgm on a typo",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const hit = yield* sancoes.buscarPorNome("alpha");
        expect(hit.map((r) => r.docNormalizado)).toContain("11222333000181");
        expect(Number(hit[0].score)).toBeLessThan(0);
        const typo = yield* sancoes.buscarPorNome("alpa");
        expect(typo.map((r) => r.docNormalizado)).toContain("11222333000181");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "vigentesNaData lists sanctions active on a date, excluding expired ones",
    () =>
      Effect.gen(function* () {
        const sancoes = yield* seeded;
        const dentro = yield* sancoes.vigentesNaData("2024-06-15");
        expect(dentro.map((r) => r.codigo)).toEqual(["S1"]);
        const fora = yield* sancoes.vigentesNaData("2026-06-15");
        expect(fora).toHaveLength(0);
        const cedo = yield* sancoes.vigentesNaData("2021-01-01");
        expect(cedo.map((r) => r.codigo)).toEqual(["S2"]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
