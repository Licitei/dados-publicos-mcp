import { TceRsLive } from "./sources/tce-rs/store";
import { TcePrLive } from "./sources/tce-pr/store";
import { ComprasGovLive } from "./sources/compras-gov/store";
import { BndesLive } from "./sources/bndes/store";
import { IbamaLive } from "./sources/ibama/store";
import { ListaSujaLive } from "./sources/mte-lista-suja/store";
import { PortalTransparenciaLive } from "./sources/portal-transparencia/store";
import { CvmLive } from "./sources/cvm/store";
import { PgfnLive } from "./sources/pgfn/store";
import { IndicesReajusteLive } from "./sources/indices-reajuste/store";
import { Layer, ManagedRuntime } from "effect";
import { DuckLive } from "./kernel/duck/duck";
import { HttpLive } from "./kernel/http/client";
import { CorpusGitLive } from "./kernel/search/corpus";
import { FuzzyLive } from "./kernel/search/fuzzy";
import { SearchLive } from "./kernel/search/search";
import { CamaraDeputadosLive } from "./sources/camara-deputados/store";
import { CapagLive } from "./sources/capag/store";
import { CatmatCatserLive } from "./sources/catmat-catser/store";
import { CmedAnvisaLive } from "./sources/cmed-anvisa/store";
import { CnaeLive } from "./sources/cnae/store";
import { IbgeEconomiaLive } from "./sources/ibge-economia/store";
import { IbgeLocalidadesLive } from "./sources/ibge-localidades/store";
import { PainelPrecosLive } from "./sources/painel-precos/store";
import { PncpLive } from "./sources/pncp/store";
import { QueridoDiarioLive } from "./sources/querido-diario/store";
import { ReceitaCnpjLive } from "./sources/receita-cnpj/store";
import { SancoesCguLive } from "./sources/sancoes-cgu/store";
import { SenadoFederalLive } from "./sources/senado/store";
import { SicafLive } from "./sources/sicaf-fornecedores/store";
import { SiconfiFiscalLive } from "./sources/siconfi-fiscal/store";
import { SinapiLive } from "./sources/sinapi/store";
import { TcuInidoneosLive } from "./sources/tcu-inidoneos/store";
import { TransparenciaDespesasLive } from "./sources/transparencia-despesas/store";
import { TransferegovLive } from "./sources/transferegov/store";
import { TseEleitoralLive } from "./sources/tse-eleitoral/store";

const Infra = Layer.mergeAll(DuckLive, HttpLive, SearchLive, FuzzyLive, CorpusGitLive);

const AppLayer = Layer.mergeAll(
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

export const runtime = ManagedRuntime.make(AppLayer);
