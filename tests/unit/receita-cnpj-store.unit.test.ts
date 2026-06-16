import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import * as TestClock from "effect/testing/TestClock";
import { FetchHttpClient } from "effect/unstable/http";
import { DbLayer } from "../../src/kernel/db/client";
import {
  ReceitaCnpj,
  ReceitaCnpjLive,
} from "../../src/sources/receita-cnpj/store";

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

const csv = (rows: readonly (readonly string[])[]) =>
  rows.map((cells) => cells.map((c) => `"${c}"`).join(";")).join("\r\n");

const empresasCsv = csv([
  ["11222333", "EMPRESA ALPHA LTDA", "2062", "16", "1000000,00", "03", ""],
  ["44555666", "BETA COMERCIO LTDA", "2062", "16", "50000,00", "01", ""],
]);

const estabelecimentosCsv = csv([
  [
    "11222333", "0001", "81", "1", "ALPHA FANTASIA", "02", "20200101", "0",
    "", "", "20100101", "6201500", "6202300", "RUA", "RUA DAS FLORES", "100",
    "", "CENTRO", "01001000", "SP", "7107", "11", "33334444", "", "", "", "",
    "alpha@example.com", "", "",
  ],
  [
    "44555666", "0001", "70", "1", "BETA FANTASIA", "02", "20210101", "0",
    "", "", "20150101", "4711301", "", "AV", "AV BRASIL", "200",
    "", "JARDIM", "20020000", "RJ", "6001", "21", "22223333", "", "", "", "",
    "beta@example.com", "", "",
  ],
]);

const sociosCsv = csv([
  [
    "11222333", "2", "CARLOS SOCIO COMUM", "***123456**", "49", "20100101",
    "", "", "", "", "4",
  ],
  [
    "11222333", "2", "ANA INVESTIDORA", "***777888**", "22", "20100101",
    "", "", "", "", "5",
  ],
  [
    "44555666", "2", "CARLOS SOCIO COMUM", "***123456**", "49", "20150101",
    "", "", "", "", "4",
  ],
]);

const simplesCsv = csv([
  ["11222333", "S", "20100101", "", "N", "", ""],
]);

const cnaesCsv = csv([
  ["6201500", "Desenvolvimento de programas de computador sob encomenda"],
  ["4711301", "Comercio varejista de mercadorias"],
]);

const naturezasCsv = csv([["2062", "Sociedade Empresaria Limitada"]]);

const municipiosCsv = csv([
  ["7107", "SAO PAULO"],
  ["6001", "RIO DE JANEIRO"],
]);

const qualificacoesCsv = csv([["49", "Socio-Administrador"]]);

const paisesCsv = csv([["105", "Brasil"]]);

const motivosCsv = csv([["0", "Sem motivo"]]);

const zipOf = (name: string, body: string, method = 0) =>
  makeZip([{ name, data: latin1(body) }], method);

const files = {
  "Cnaes.zip": zipOf("K03200.D.CNAECSV", cnaesCsv),
  "Naturezas.zip": zipOf("K03200.D.NATJUCSV", naturezasCsv),
  "Municipios.zip": zipOf("K03200.D.MUNICCSV", municipiosCsv),
  "Qualificacoes.zip": zipOf("K03200.D.QUALSCSV", qualificacoesCsv),
  "Paises.zip": zipOf("K03200.D.PAISCSV", paisesCsv),
  "Motivos.zip": zipOf("K03200.D.MOTICSV", motivosCsv),
  "Empresas0.zip": zipOf("K03200.D.EMPRECSV", empresasCsv, 8),
  "Estabelecimentos0.zip": zipOf("K03200.D.ESTABELE", estabelecimentosCsv, 8),
  "Socios0.zip": zipOf("K03200.D.SOCIOCSV", sociosCsv),
  "Simples.zip": zipOf("K03200.D.SIMPLES", simplesCsv),
};

const route = async (input: string | URL | Request): Promise<Response> => {
  const url = String(input);
  const live = url.includes("/1970-01/");
  const match = Object.entries(files).find(([name]) =>
    url.endsWith(`/${name}`)
  );
  return live && match
    ? new Response(match[1])
    : new Response("rota desconhecida", { status: 404 });
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const TestLayer = Layer.mergeAll(
  ReceitaCnpjLive.pipe(Layer.provide(Layer.mergeAll(DbLayer, HttpStub))),
  DbLayer,
  HttpStub
);

const seeded = Effect.gen(function* () {
  const receita = yield* ReceitaCnpj;
  yield* TestClock.setTime(Date.UTC(1970, 1, 15));
  yield* receita.index;
  return receita;
});

describe("receita-cnpj store + month-regression ingest", () => {
  it.effect(
    "index resolves the live month, parses headerless csvs, counts rows",
    () =>
      Effect.gen(function* () {
        const receita = yield* ReceitaCnpj;
        yield* TestClock.setTime(Date.UTC(1970, 1, 15));
        const counts = yield* receita.index;
        expect(counts).toEqual({
          empresas: 2,
          estabelecimentos: 2,
          socios: 3,
          simples: 1,
          dominios: 8,
        });
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "consultarCnpj returns the full profile with resolved dominio labels",
    () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const profile = yield* receita.consultarCnpj("11.222.333/0001-81");
        expect(profile).not.toBeNull();
        expect(profile?.razao_social).toBe("EMPRESA ALPHA LTDA");
        expect(profile?.natureza_juridica_descricao).toBe(
          "Sociedade Empresaria Limitada"
        );
        expect(profile?.cnae_principal_descricao).toBe(
          "Desenvolvimento de programas de computador sob encomenda"
        );
        expect(profile?.porte).toBe("empresa de pequeno porte");
        const endereco = profile?.endereco as Record<string, unknown>;
        expect(endereco.municipio).toBe("SAO PAULO");
        expect(endereco.uf).toBe("SP");
        const socios = profile?.socios as readonly Record<string, unknown>[];
        expect(socios).toHaveLength(2);
        const invalido = yield* Effect.flip(receita.consultarCnpj("123"));
        expect(invalido._tag).toBe("ReceitaCnpjError");
        expect(invalido.message).toContain("14 dígitos");
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarEmpresaPorNome matches by bm25 then falls back to trgm typo",
    () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const hit = yield* receita.buscarEmpresaPorNome("alpha");
        expect(hit.map((r) => r.cnpjBasico)).toContain("11222333");
        expect(Number(hit[0].score)).toBeLessThan(0);
        expect(hit[0].uf).toBe("SP");
        const typo = yield* receita.buscarEmpresaPorNome("alpa");
        expect(typo.map((r) => r.cnpjBasico)).toContain("11222333");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "buscarSocioPorNome matches by bm25, enriches razao_social",
    () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const hit = yield* receita.buscarSocioPorNome("carlos socio comum");
        expect(hit.map((r) => r.nomeSocio)).toContain("CARLOS SOCIO COMUM");
        expect(Number(hit[0].score)).toBeLessThan(0);
        expect(hit.some((r) => r.razao_social !== null)).toBe(true);
        const typo = yield* receita.buscarSocioPorNome("socir");
        expect(typo.map((r) => r.nomeSocio)).toContain("CARLOS SOCIO COMUM");
        expect(Number(typo[0].score)).toBeGreaterThan(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "sociosEmComum finds a socio shared by two cnpj_basicos",
    () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const comuns = yield* receita.sociosEmComum([
          "11.222.333/0001-81",
          "44.555.666/0001-70",
        ]);
        expect(comuns).toHaveLength(1);
        expect(comuns[0].nome_socio).toBe("CARLOS SOCIO COMUM");
        expect(comuns[0].quantidade_empresas).toBe(2);
        expect((comuns[0].cnpjs_basicos as string[]).sort()).toEqual([
          "11222333",
          "44555666",
        ]);
        const solo = yield* receita.sociosEmComum(["11.222.333/0001-81"]);
        expect(solo).toHaveLength(0);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );

  it.effect(
    "filtrarEmpresas honors a uf + cnae relational filter",
    () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const rows = yield* receita.filtrarEmpresas({
          uf: "SP",
          cnae: "6201500",
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].cnpj).toBe("11222333000181");
        expect(rows[0].razao_social).toBe("EMPRESA ALPHA LTDA");
        expect(rows[0].municipio).toBe("SAO PAULO");
        const outraUf = yield* receita.filtrarEmpresas({ uf: "RJ" });
        expect(outraUf.map((r) => r.cnpj)).toEqual(["44555666000170"]);
      }).pipe(Effect.provide(TestLayer)),
    60_000
  );
});
