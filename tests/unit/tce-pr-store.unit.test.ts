import { expect, layer } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import { Duck } from "../../src/kernel/duck/duck";
import { Fuzzy } from "../../src/kernel/search/fuzzy";
import { TcePr, TcePrLive } from "../../src/sources/tce-pr/store";
import { fixtureLayer, pathIncludes } from "./support/fixture-server";
import { TestDuckLive } from "./support/test-duck";
import { TestFuzzyLive } from "./support/test-fuzzy";

const header =
  "dsModalidadeLicitacao;nmRazaoSocial;nrDocumento;cdIBGE;nmMunicipio;nrAno;nrProcessoEdital;dsTipoAvaliacao;dsObjeto;nrDotacaoOrcamentaria;dtAberturaLicitacao;dtLancamentoPublicacao;vlReferencia;nrEditalOrigem;dtCancelamento;dhRegistro;dhAtualizacao;dhRegistroCancelamento;dtAberturaLicitacaoNova;dtAtualizacaodtAbertura;dtAtualizacaodtAberturaNova;flRecursoInternacional;flPrioridadeContratacaoME;flExclusivoEPPME;flCotaParticipacaoEPPME;nrPercentualParticipacaoEPPME;flExigeSubcontratacaoEPPME;flvlSigiloso";
const row = (documento: string) => {
  const values = new Map<string, string>([
    ["nmRazaoSocial", "Órgão"],
    ["nrDocumento", documento],
    ["cdIBGE", "4106902"],
    ["nmMunicipio", "Curitiba"],
    ["nrAno", "2026"],
    ["dsObjeto", "Aquisição de café"],
    ["vlReferencia", "1.234,56"],
  ]);
  return Arr.join(
    Arr.map(Str.split(header, ";"), (column) => values.get(column) ?? ""),
    ";"
  );
};
const csv = `${header}\n${row("12345678901")}\n${row("12345678000190")}`;
const fixtures = fixtureLayer([
  {
    match: pathIncludes("2026_mural_de_licitacoes_base_de_dados.csv"),
    respond: (hit) => ({ body: hit === 1 ? csv : "unexpected;columns\nbroken;schema" }),
  },
]);
const TestLayer = TcePrLive.pipe(
  Layer.provideMerge(Layer.mergeAll(TestDuckLive, TestFuzzyLive, fixtures))
);
layer(TestLayer, { timeout: Duration.seconds(60), excludeTestServices: true })(
  "TCE-PR annual official CSV",
  (it) => {
    it.effect(
      "preserves official fields, masks CPF, deduplicates years and rolls back schema drift",
      () =>
        Effect.gen(function* () {
          const service = yield* TcePr;
          const duck = yield* Duck;
          const fuzzy = yield* Fuzzy;
          const loaded = yield* service.indexYears([2026, 2026]);
          expect(loaded).toBe(2);
          const rows = yield* duck.query(
            Schema.Struct({
              nrDocumento: Schema.String,
              vlReferencia: Schema.Finite,
              __ano: Schema.Finite,
            }),
            'SELECT "nrDocumento", "vlReferencia", __ano FROM tce_pr_licitacao ORDER BY __id'
          );
          expect(rows).toEqual([
            { nrDocumento: "***.456.789-**", vlReferencia: 1234.56, __ano: 2026 },
            { nrDocumento: "12345678000190", vlReferencia: 1234.56, __ano: 2026 },
          ]);
          const matches = yield* fuzzy.match("tce_pr_licitacao", "cafe");
          expect(matches.length).toBeGreaterThan(0);
          const failure = yield* Effect.flip(service.indexYears([2026]));
          expect(failure.code).toBe("tce-pr.PARSE");
          const preserved = yield* duck.query(
            Schema.Struct({ n: Schema.Finite }),
            "SELECT count(*)::INTEGER AS n FROM tce_pr_licitacao"
          );
          expect(preserved).toEqual([{ n: 2 }]);
        })
    );
  }
);
