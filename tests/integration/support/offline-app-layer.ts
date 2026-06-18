import { Layer } from "effect";
import { FetchHttpClient } from "effect/unstable/http";
import { EmbedderStub } from "../../unit/support/embedder-stub";
import { TestDbLive } from "../../unit/support/test-db";
import { CamaraDeputadosLive } from "../../../src/sources/camara-deputados/store";
import { CapagLive } from "../../../src/sources/capag/store";
import { CatmatCatserLive } from "../../../src/sources/catmat-catser/store";
import { CmedAnvisaLive } from "../../../src/sources/cmed-anvisa/store";
import { CnaeLive } from "../../../src/sources/cnae/store";
import { IbgeEconomiaLive } from "../../../src/sources/ibge-economia/store";
import { IbgeLocalidadesLive } from "../../../src/sources/ibge-localidades/store";
import { LegislacaoLive } from "../../../src/sources/legislacao/store";
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

const route = async (input: string | URL | Request): Promise<Response> =>
  new Response(`rota nao stubada: ${String(input)}`, { status: 404 });

const fetchStub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, fetchStub))
);

const Infra = Layer.mergeAll(TestDbLive, EmbedderStub, HttpStub);

export const offlineSources = Layer.mergeAll(
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
  TransparenciaDespesasLive,
  SinapiLive
).pipe(Layer.provideMerge(Infra));
