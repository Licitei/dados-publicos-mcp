import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { Transferegov, TransferegovLive } from "../../src/sources/transferegov/store";
import { storedZip, utf8 } from "./support/stored-zip";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";

const propostaCsv = Arr.join(
  [
    "ID_PROPOSTA;UF_PROPONENTE;MUNIC_PROPONENTE;COD_MUNIC_IBGE;DESC_ORGAO_SUP;DESC_ORGAO;MODALIDADE;IDENTIF_PROPONENTE;NM_PROPONENTE;OBJETO_PROPOSTA",
    "73142;SP;BARRA DO TURVO;3505401;MINISTERIO DA CIDADANIA;FUNDO NACIONAL;CONTRATO DE REPASSE;46634317000180;MUNICIPIO DE BARRA DO TURVO;Construcao de Centro de Referencia de Assistencia Social CRAS",
    "87118;RJ;MARICA;3302700;MINISTERIO DO ESPORTE;SECRETARIA;CONVENIO;11222333000181;ASSOCIACAO BETA;Reforma de quadra poliesportiva municipal",
  ],
  "\r\n"
);

const convenioCsv = Arr.join(
  [
    "NR_CONVENIO;ID_PROPOSTA;SIT_CONVENIO;DIA_PUBL_CONV;DIA_INIC_VIGENC_CONV;DIA_FIM_VIGENC_CONV;VL_GLOBAL_CONV;VL_REPASSE_CONV",
    "724072;73142;Prestacao de Contas Aprovada;31/12/2009;05/01/2010;05/01/2011;106392,38;98200,00",
    "800000;87118;Em execucao;10/02/2020;15/02/2020;15/02/2022;250000,00;240000,00",
  ],
  "\r\n"
);

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("siconv_proposta"),
    respond: {
      body: storedZip([{ name: "siconv_proposta.csv", bytes: utf8(propostaCsv) }]),
    },
  },
  {
    match: pathIncludes("siconv_convenio"),
    respond: {
      body: storedZip([{ name: "siconv_convenio.csv", bytes: utf8(convenioCsv) }]),
    },
  },
]);

const TestLayer = TransferegovLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, HttpFixture))
);

const seeded = Effect.gen(function* () {
  const tg = yield* Transferegov;
  yield* tg.index;
  return tg;
});

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "transferegov store + zip/csv ingest",
  (it) => {
    it.effect("merges convenio with proposta enrichment on ID_PROPOSTA", () =>
      Effect.gen(function* () {
        const tg = yield* Transferegov;
        const result = yield* tg.index;
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      })
    );

    it.effect("conveniosDoProponente sums repasse and carries the joined objeto/CNPJ", () =>
      Effect.gen(function* () {
        const tg = yield* seeded;
        const prop = yield* tg.conveniosDoProponente("46.634.317/0001-80");
        expect(prop.docNormalizado).toBe("46634317000180");
        expect(prop.count).toBe(1);
        expect(prop.totalRepasse).toBeCloseTo(98200, 0);
        const first = Arr.head(prop.convenios);
        expect(Option.map(first, (c) => c.objeto)).toEqual(
          Option.some(expect.stringContaining("Centro de Referencia"))
        );
        expect(Option.map(first, (c) => c.municipio)).toEqual(Option.some("BARRA DO TURVO"));
      })
    );

    it.effect("buscarConvenio by objeto (bm25) and conveniosDoMunicipio by IBGE code", () =>
      Effect.gen(function* () {
        const tg = yield* seeded;
        const hits = yield* tg.buscarConvenio("centro referencia assistencia");
        expect(Arr.map(hits, (r) => r.nrConvenio)).toContain("724072");
        const muni = yield* tg.conveniosDoMunicipio("3302700", 10);
        expect(Arr.map(muni, (r) => r.nrConvenio)).toEqual(["800000"]);
      })
    );
  }
);
