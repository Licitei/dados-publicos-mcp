import { expect, layer } from "@effect/vitest";
import { DateTime, Duration, Effect, Layer, Order, Predicate } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import * as Str from "effect/String";
import { ReceitaCnpj, ReceitaCnpjLive } from "../../src/sources/receita-cnpj/store";
import { yyyymm } from "../../src/sources/receita-cnpj/catalog";
import { fixtureLayer } from "./support/fixture-server";
import { zip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";

const latin1 = (text: string) =>
  Uint8Array.from(
    Arr.map(Arr.fromIterable(text), (c) => Str.codePointAt(0)(c).pipe(Option.getOrElse(() => 0)))
  );

const csv = (rows: readonly (readonly string[])[]) =>
  Arr.join(
    Arr.map(rows, (cells) =>
      Arr.join(
        Arr.map(cells, (c) => `"${c}"`),
        ";"
      )
    ),
    "\r\n"
  );

const empresasCsv = csv([
  ["11222333", "EMPRESA ALPHA LTDA", "2062", "16", "1000000,00", "03", ""],
  ["44555666", "BETA COMERCIO LTDA", "2062", "16", "50000,00", "01", ""],
]);

const estabelecimentosCsv = csv([
  [
    "11222333",
    "0001",
    "81",
    "1",
    "ALPHA FANTASIA",
    "02",
    "20200101",
    "0",
    "",
    "",
    "20100101",
    "6201500",
    "6202300",
    "RUA",
    "RUA DAS FLORES",
    "100",
    "",
    "CENTRO",
    "01001000",
    "SP",
    "7107",
    "11",
    "33334444",
    "",
    "",
    "",
    "",
    "alpha@example.com",
    "",
    "",
  ],
  [
    "44555666",
    "0001",
    "70",
    "1",
    "BETA FANTASIA",
    "02",
    "20210101",
    "0",
    "",
    "",
    "20150101",
    "4711301",
    "",
    "AV",
    "AV BRASIL",
    "200",
    "",
    "JARDIM",
    "20020000",
    "RJ",
    "6001",
    "21",
    "22223333",
    "",
    "",
    "",
    "",
    "beta@example.com",
    "",
    "",
  ],
]);

const sociosCsv = csv([
  ["11222333", "2", "CARLOS SOCIO COMUM", "***123456**", "49", "20100101", "", "", "", "", "4"],
  ["11222333", "2", "ANA INVESTIDORA", "***777888**", "22", "20100101", "", "", "", "", "5"],
  ["44555666", "2", "CARLOS SOCIO COMUM", "***123456**", "49", "20150101", "", "", "", "", "4"],
]);

const simplesCsv = csv([["11222333", "S", "20100101", "", "N", "", ""]]);

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

const zipOf = (name: string, body: string) =>
  zip([{ name, bytes: latin1(body) }], { method: "store" });

const deflatedZipOf = (name: string, body: string) =>
  zip([{ name, bytes: latin1(body) }], { method: "deflate" });

const files = Effect.all(
  {
    "Cnaes.zip": zipOf("K03200.D.CNAECSV", cnaesCsv),
    "Naturezas.zip": zipOf("K03200.D.NATJUCSV", naturezasCsv),
    "Municipios.zip": zipOf("K03200.D.MUNICCSV", municipiosCsv),
    "Qualificacoes.zip": zipOf("K03200.D.QUALSCSV", qualificacoesCsv),
    "Paises.zip": zipOf("K03200.D.PAISCSV", paisesCsv),
    "Motivos.zip": zipOf("K03200.D.MOTICSV", motivosCsv),
    "Empresas0.zip": deflatedZipOf("K03200.D.EMPRECSV", empresasCsv),
    "Estabelecimentos0.zip": deflatedZipOf("K03200.D.ESTABELE", estabelecimentosCsv),
    "Socios0.zip": zipOf("K03200.D.SOCIOCSV", sociosCsv),
    "Simples.zip": zipOf("K03200.D.SIMPLES", simplesCsv),
  },
  { concurrency: 2 }
);

const liveMonth = yyyymm(DateTime.toEpochMillis(DateTime.nowUnsafe()), 1);

const HttpFixture = Layer.unwrap(
  files.pipe(
    Effect.map((resolved) =>
      fixtureLayer(
        Arr.map(Rec.toEntries(resolved), ([name, body]) => ({
          match: (url: URL) => Str.endsWith(`/${liveMonth}/${name}`)(url.pathname),
          respond: { body },
        }))
      )
    )
  )
);

const TestLayer = Layer.mergeAll(
  ReceitaCnpjLive.pipe(Layer.provide(Layer.mergeAll(TestDuckLive, HttpFixture))),
  TestDuckLive,
  HttpFixture
);

const record = (value: unknown): Readonly<Record<string, unknown>> =>
  Predicate.isObject(value) ? value : {};

const records = (value: unknown): readonly Readonly<Record<string, unknown>>[] =>
  Arr.isArray(value) ? Arr.map(value, record) : [];

const seeded = Effect.gen(function* () {
  const receita = yield* ReceitaCnpj;
  yield* receita.index;
  return receita;
});

layer(TestLayer, { timeout: Duration.seconds(180), excludeTestServices: true })(
  "receita-cnpj store + month-regression ingest",
  (it) => {
    it.effect("index resolves the live month, parses headerless csvs, counts rows", () =>
      Effect.gen(function* () {
        const receita = yield* ReceitaCnpj;
        const counts = yield* receita.index;
        expect(counts).toEqual({
          empresas: 2,
          estabelecimentos: 2,
          socios: 3,
          simples: 1,
          dominios: 8,
        });
      })
    );

    it.effect("consultarCnpj returns the full profile with resolved dominio labels", () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const profile = yield* receita.consultarCnpj("11.222.333/0001-81");
        expect(profile).not.toBeNull();
        const full = record(profile);
        expect(full["razao_social"]).toBe("EMPRESA ALPHA LTDA");
        expect(full["natureza_juridica_descricao"]).toBe("Sociedade Empresaria Limitada");
        expect(full["cnae_principal_descricao"]).toBe(
          "Desenvolvimento de programas de computador sob encomenda"
        );
        expect(full["porte"]).toBe("empresa de pequeno porte");
        const endereco = record(full["endereco"]);
        expect(endereco["municipio"]).toBe("SAO PAULO");
        expect(endereco["uf"]).toBe("SP");
        expect(records(full["socios"])).toHaveLength(2);
        const invalido = yield* Effect.flip(receita.consultarCnpj("123"));
        expect(invalido._tag).toBe("ReceitaCnpjError");
        expect(invalido.message).toContain("14 dígitos");
      })
    );

    it.effect("buscarEmpresaPorNome matches normalized tokens and finds infixes", () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const hit = yield* receita.buscarEmpresaPorNome("alpha");
        expect(Arr.map(hit, (r) => r.cnpjBasico)).toContain("11222333");
        expect(Option.map(Arr.head(hit), (r) => Number(r.score) > 0)).toEqual(Option.some(true));
        expect(Option.map(Arr.head(hit), (r) => r.uf)).toEqual(Option.some("SP"));
        const typo = yield* receita.buscarEmpresaPorNome("lpha");
        expect(Arr.map(typo, (r) => r.cnpjBasico)).toContain("11222333");
        expect(Option.map(Arr.head(typo), (r) => Number(r.score) > 0)).toEqual(Option.some(true));
      })
    );

    it.effect(
      "buscarSocioPorNome matches by normalized tokens in any order and enriches razao_social",
      () =>
        Effect.gen(function* () {
          const receita = yield* seeded;
          const hit = yield* receita.buscarSocioPorNome("carlos socio comum");
          expect(Arr.map(hit, (r) => r.nomeSocio)).toContain("CARLOS SOCIO COMUM");
          expect(Option.map(Arr.head(hit), (r) => Number(r.score) > 0)).toEqual(Option.some(true));
          expect(Arr.some(hit, (r) => r.razao_social !== null)).toBe(true);
          const typo = yield* receita.buscarSocioPorNome("rlos");
          expect(Arr.map(typo, (r) => r.nomeSocio)).toContain("CARLOS SOCIO COMUM");
          expect(Option.map(Arr.head(typo), (r) => Number(r.score) > 0)).toEqual(Option.some(true));
        })
    );

    it.effect("sociosEmComum finds a socio shared by two cnpj_basicos", () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const comuns = yield* receita.sociosEmComum(["11.222.333/0001-81", "44.555.666/0001-70"]);
        expect(comuns).toHaveLength(1);
        const comum = record(Arr.head(comuns).pipe(Option.getOrUndefined));
        expect(comum["nome_socio"]).toBe("CARLOS SOCIO COMUM");
        expect(comum["quantidade_empresas"]).toBe(2);
        expect(
          Arr.sort(
            Arr.filter(
              Arr.isArray(comum["cnpjs_basicos"]) ? comum["cnpjs_basicos"] : [],
              Predicate.isString
            ),
            Order.String
          )
        ).toEqual(["11222333", "44555666"]);
        const solo = yield* receita.sociosEmComum(["11.222.333/0001-81"]);
        expect(solo).toHaveLength(0);
      })
    );

    it.effect("filtrarEmpresas honors a uf + cnae relational filter", () =>
      Effect.gen(function* () {
        const receita = yield* seeded;
        const rows = yield* receita.filtrarEmpresas({
          uf: "SP",
          cnae: "6201500",
        });
        expect(rows).toHaveLength(1);
        const first = record(Arr.head(rows).pipe(Option.getOrUndefined));
        expect(first["cnpj"]).toBe("11222333000181");
        expect(first["razao_social"]).toBe("EMPRESA ALPHA LTDA");
        expect(first["municipio"]).toBe("SAO PAULO");
        const outraUf = yield* receita.filtrarEmpresas({ uf: "RJ" });
        expect(Arr.map(outraUf, (r) => r.cnpj)).toEqual(["44555666000170"]);
      })
    );
  }
);
