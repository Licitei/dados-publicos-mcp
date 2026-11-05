import { TestFuzzyLive } from "./support/test-fuzzy";
import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer } from "effect";
import * as Arr from "effect/Array";
import {
  TransparenciaDespesas,
  TransparenciaDespesasLive,
} from "../../src/sources/transparencia-despesas/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip, utf8 } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";

const despesasCsv = Arr.join(
  [
    "Ano e mes do lancamento;Codigo Orgao Superior;Nome Orgao Superior;Codigo Orgao Subordinado;Nome Orgao Subordinado;Codigo Funcao;Nome Funcao;Codigo Programa Orcamentario;Nome Programa Orcamentario;Codigo Acao;Nome Acao;UF;Municipio;Nome Elemento de Despesa;Valor Empenhado (R$);Valor Liquidado (R$);Valor Pago (R$)",
    "2024/01;35000;Ministerio das Relacoes Exteriores;35101;MRE Unidades;07;Relacoes exteriores;2216;POLITICA EXTERNA;20WX;RELACOES E NEGOCIACOES MULTILATERAIS;DF;BRASILIA;Diarias;1000000,00;800000,00;750000,00",
    "2024/01;26000;Ministerio da Educacao;26298;Universidade X;12;Educacao;2080;EDUCACAO SUPERIOR;20RK;FUNCIONAMENTO CAMPI;SP;SAO PAULO;Equipamentos;5000000,00;3000000,00;2500000,00",
  ],
  "\r\n"
);

const HttpFixture = fixtureLayer([
  {
    match: pathIncludes("202401_Despesas.zip"),
    respond: {
      body: storedZip([{ name: "202401_Despesas.csv", bytes: utf8(despesasCsv) }]),
    },
  },
]);

const TestLayer = TransparenciaDespesasLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, HttpFixture))
);

layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "transparencia-despesas store + zip/csv ingest",
  (it) => {
    it.effect("indexes a month of federal budget execution", () =>
      Effect.gen(function* () {
        const td = yield* TransparenciaDespesas;
        const result = yield* td.indexMes("2024-01");
        expect(result.anoMes).toBe("202401");
        expect(result.inserted).toBe(2);
        expect(result.total).toBe(2);
      })
    );
  }
);
