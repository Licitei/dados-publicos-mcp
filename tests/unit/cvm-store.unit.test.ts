import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { Cvm, CvmLive } from "../../src/sources/cvm/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { storedZip } from "./support/stored-zip";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const archive = storedZip([
  {
    name: "processo_sancionador.csv",
    bytes: Buffer.from(
      "NUP;Objeto;Ementa;Data_Abertura;Fase_Atual;Subfase_Atual;Data_Ultima_Movimentacao\r\n19957.000001/2026-01;Divulgação de informações;Apuração;2026-01-01;Citação;Defesa;2026-01-02",
      "latin1"
    ),
  },
  {
    name: "processo_sancionador_acusado.csv",
    bytes: Buffer.from(
      "NUP;Nome_Acusado;Situacao;Data_Situacao\r\n19957.000001/2026-01;Companhia Açúcar;Em análise;2026-01-02\r\n19957.000001/2026-01;Pessoa Física;Em análise;2026-01-02",
      "latin1"
    ),
  },
]);
const fixtures = fixtureLayer([
  {
    match: pathIncludes("cad_cia_aberta.csv"),
    respond: {
      body: Buffer.from(
        "CNPJ_CIA;DENOM_SOCIAL;CD_CVM;SIT_REG;DT_REG\r\n12.345.678/0001-90;Companhia Açúcar;123;ATIVO;2020-01-01",
        "latin1"
      ),
    },
  },
  {
    match: pathIncludes("cad_fi.csv"),
    respond: {
      body: Buffer.from(
        "CNPJ_FUNDO;DENOM_SOCIAL;SIT;DT_REG\r\n98.765.432/0001-10;Fundo Imobiliário;EM FUNCIONAMENTO NORMAL;2021-01-01",
        "latin1"
      ),
    },
  },
  { match: pathIncludes("processo_sancionador.zip"), respond: { body: archive } },
]);
const TestLayer = CvmLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "CVM real CSV and ZIP indexing",
  (it) => {
    it.effect(
      "indexes both cadastros and joins accused by the actual NUP without inventing CNPJ",
      () =>
        Effect.gen(function* () {
          const service = yield* Cvm;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const loaded = yield* service.index;
          expect(loaded).toBe(5);
          const companies = yield* duck.query(
            Schema.Struct({ cnpj: Schema.String, nome: Schema.String }),
            "SELECT cnpj, nome FROM cvm_companhia"
          );
          expect(companies).toEqual([{ cnpj: "12345678000190", nome: "Companhia Açúcar" }]);
          const accused = yield* duck.query(
            Schema.Struct({ nome: Schema.String, fase: Schema.String }),
            "SELECT a.nome, p.fase FROM cvm_acusado a JOIN cvm_processo p USING (nup) ORDER BY a.nome"
          );
          expect(accused).toEqual([
            { nome: "Companhia Açúcar", fase: "Citação" },
            { nome: "Pessoa Física", fase: "Citação" },
          ]);
          const matches = yield* fuzzy.match("cvm_acusado", "acucar");
          expect(matches.length).toBeGreaterThan(0);
          yield* service.index;
          const counts = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM cvm_acusado"
          );
          expect(counts).toEqual([{ n: 2 }]);
        })
    );
  }
);
