import { TceRsLive } from "../../../src/sources/tce-rs/store";
import { TcePrLive } from "../../../src/sources/tce-pr/store";
import { ComprasGovLive } from "../../../src/sources/compras-gov/store";
import { BndesLive } from "../../../src/sources/bndes/store";
import { IbamaLive } from "../../../src/sources/ibama/store";
import { ListaSujaLive } from "../../../src/sources/mte-lista-suja/store";
import { PortalTransparenciaLive } from "../../../src/sources/portal-transparencia/store";
import { CvmLive } from "../../../src/sources/cvm/store";
import { PgfnLive } from "../../../src/sources/pgfn/store";
import { IndicesReajusteLive } from "../../../src/sources/indices-reajuste/store";
import { Effect, Layer } from "effect";
import { fixtureLayer } from "../../unit/support/fixture-server";
import { TestDuckLive } from "../../unit/support/test-duck";
import { TestSearchLive } from "../../unit/support/test-search";
import { TestFuzzyLive } from "../../unit/support/test-fuzzy";
import { CamaraDeputadosLive } from "../../../src/sources/camara-deputados/store";
import { CapagLive } from "../../../src/sources/capag/store";
import { CatmatCatserLive } from "../../../src/sources/catmat-catser/store";
import { CmedAnvisaLive } from "../../../src/sources/cmed-anvisa/store";
import { CnaeLive } from "../../../src/sources/cnae/store";
import { IbgeEconomiaLive } from "../../../src/sources/ibge-economia/store";
import { IbgeLocalidadesLive } from "../../../src/sources/ibge-localidades/store";
import { PainelPrecosLive } from "../../../src/sources/painel-precos/store";
import { PncpLive } from "../../../src/sources/pncp/store";
import { QueridoDiarioLive } from "../../../src/sources/querido-diario/store";
import { ReceitaCnpjLive } from "../../../src/sources/receita-cnpj/store";
import { SancoesCguLive } from "../../../src/sources/sancoes-cgu/store";
import { SenadoFederalLive } from "../../../src/sources/senado/store";
import { SicafLive } from "../../../src/sources/sicaf-fornecedores/store";
import { SiconfiFiscalLive } from "../../../src/sources/siconfi-fiscal/store";
import { SinapiLive } from "../../../src/sources/sinapi/store";
import { TcuInidoneosLive } from "../../../src/sources/tcu-inidoneos/store";
import { TransparenciaDespesasLive } from "../../../src/sources/transparencia-despesas/store";
import { TransferegovLive } from "../../../src/sources/transferegov/store";
import { TseEleitoralLive } from "../../../src/sources/tse-eleitoral/store";

const HttpOffline = fixtureLayer([]);

const Infra = Layer.mergeAll(TestDuckLive, TestSearchLive, TestFuzzyLive, HttpOffline);

const offlineSources = Layer.mergeAll(
  IbgeLocalidadesLive,
  CnaeLive,
  CatmatCatserLive,
  SicafLive,
  SancoesCguLive,
  ReceitaCnpjLive,
  TseEleitoralLive,
  CamaraDeputadosLive,
  QueridoDiarioLive,
  CapagLive,
  PncpLive,
  TcuInidoneosLive,
  IbgeEconomiaLive,
  SenadoFederalLive,
  CmedAnvisaLive,
  SiconfiFiscalLive,
  TransferegovLive,
  PainelPrecosLive,
  TransparenciaDespesasLive,
  SinapiLive,
  IndicesReajusteLive,
  PgfnLive,
  CvmLive,
  PortalTransparenciaLive,
  ListaSujaLive,
  IbamaLive,
  BndesLive,
  ComprasGovLive,
  TcePrLive,
  TceRsLive
).pipe(Layer.provideMerge(Infra));

export const withOfflineSources = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Layer.build(offlineSources).pipe(
    Effect.orDie,
    Effect.flatMap((context) => Effect.provideContext(effect, context)),
    Effect.scoped
  );
