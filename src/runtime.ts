import { Layer, ManagedRuntime } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { BunServices } from "@effect/platform-bun";
import { DbLayer } from "./kernel/db/client";
import { DbPersistenceLive } from "./kernel/db/persistence";
import { EmbedderLive } from "./kernel/embed/embedder";
import { CamaraDeputadosLive } from "./sources/camara-deputados/store";
import { CapagLive } from "./sources/capag/store";
import { CatmatCatserLive } from "./sources/catmat-catser/store";
import { CmedAnvisaLive } from "./sources/cmed-anvisa/store";
import { CnaeLive } from "./sources/cnae/store";
import { IbgeEconomiaLive } from "./sources/ibge-economia/store";
import { IbgeLocalidadesLive } from "./sources/ibge-localidades/store";
import { LegislacaoLive } from "./sources/legislacao/store";
import { PainelPrecosLive } from "./sources/painel-precos/store";
import { PncpLive } from "./sources/pncp/store";
import { QueridoDiarioLive } from "./sources/querido-diario/store";
import { ReceitaCnpjLive } from "./sources/receita-cnpj/store";
import { SancoesCguLive } from "./sources/sancoes-cgu/store";
import { SenadoFederalLive } from "./sources/senado/store";
import { SicafLive } from "./sources/sicaf-fornecedores/store";
import { SiconfiFiscalLive } from "./sources/siconfi-fiscal/store";
import { TcuInidoneosLive } from "./sources/tcu-inidoneos/store";
import { TransparenciaDespesasLive } from "./sources/transparencia-despesas/store";
import { TransferegovLive } from "./sources/transferegov/store";
import { TseEleitoralLive } from "./sources/tse-eleitoral/store";

const Persistence = DbPersistenceLive.pipe(Layer.provide(BunServices.layer));

const Infra = Layer.mergeAll(
  DbLayer.pipe(Layer.provide(Persistence)),
  EmbedderLive,
  FetchHttpClient.layer
);

export const AppLayer = Layer.mergeAll(
  LegislacaoLive,
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
  TransparenciaDespesasLive
).pipe(Layer.provideMerge(Infra));

export const runtime = ManagedRuntime.make(AppLayer);
