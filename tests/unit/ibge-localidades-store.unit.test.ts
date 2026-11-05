import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import { Duck } from "../../src/kernel/duck/duck";
import {
  IbgeLocalidades,
  IbgeLocalidadesLive,
  municipioTable,
} from "../../src/sources/ibge-localidades/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const uf = (sigla: string, id: number, nome: string) => ({
  id,
  sigla,
  nome,
  regiao: { id: 5, sigla: sigla === "SP" ? "SE" : "CO", nome: "Regiao" },
});

const withMicro = (
  id: number,
  nome: string,
  ufObj: ReturnType<typeof uf>,
  mesoId: number,
  mesoNome: string
) => ({
  id,
  nome,
  microrregiao: {
    id: mesoId * 10,
    nome: `${mesoNome} micro`,
    mesorregiao: { id: mesoId, nome: mesoNome, UF: ufObj },
  },
});

const SP = uf("SP", 35, "Sao Paulo");
const GO = uf("GO", 52, "Goias");

const municipiosRows = [
  withMicro(3550308, "São Paulo", SP, 3515, "Metropolitana de São Paulo"),
  withMicro(3509502, "Campinas", SP, 3520, "Campinas"),
  withMicro(3548708, "Santos", SP, 3516, "Macro Metropolitana Paulista"),
  withMicro(5208707, "Goiânia", GO, 5203, "Centro Goiano"),
  withMicro(5201405, "Anápolis", GO, 5203, "Centro Goiano"),
];

const quote = (value: string) => `"${value}"`;

const ufJson = (u: ReturnType<typeof uf>) =>
  `{"id":${u.id},"sigla":${quote(u.sigla)},"nome":${quote(u.nome)},"regiao":{"id":${u.regiao.id},"sigla":${quote(u.regiao.sigla)},"nome":${quote(u.regiao.nome)}}}`;

const microJson = (row: ReturnType<typeof withMicro>) =>
  `{"id":${row.id},"nome":${quote(row.nome)},"microrregiao":{"id":${row.microrregiao.id},"nome":${quote(row.microrregiao.nome)},"mesorregiao":{"id":${row.microrregiao.mesorregiao.id},"nome":${quote(row.microrregiao.mesorregiao.nome)},"UF":${ufJson(row.microrregiao.mesorregiao.UF)}}}}`;

const edgeJson = `{"id":5101837,"nome":"Pescaria Brava","microrregiao":null,"regiao-imediata":{"id":520005,"nome":"Imediata","regiao-intermediaria":{"id":5201,"nome":"Intermediaria","UF":${ufJson(GO)}}}}`;

const municipiosBody = `[${Arr.join(
  Arr.append(Arr.map(municipiosRows, microJson), edgeJson),
  ","
)}]`;

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("/municipios"),
    respond: {
      body: municipiosBody,
      headers: { "content-type": "application/json" },
    },
  },
]);

const TestLayer = IbgeLocalidadesLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

const seeded = Effect.gen(function* () {
  const ibge = yield* IbgeLocalidades;
  yield* ibge.index;
  return ibge;
});

layer(TestLayer, { timeout: Duration.seconds(60) })(
  "ibge-localidades store + fuzzy resolver",
  (it) => {
    it.effect("index persists rows queryable via the Duck handle", () =>
      Effect.gen(function* () {
        yield* seeded;
        const duck = yield* Duck;
        const total = yield* duck.count(municipioTable);
        expect(total).toBe(6);
      })
    );
  }
);
