import { skillTools } from "./skills";
import { statusIndices } from "./status";
import type { Tool } from "./tool";
import { camaraTools } from "./tools/camara";
import { capagTools } from "./tools/capag";
import { catmatCatserTools } from "./tools/catmat-catser";
import { cmedTools } from "./tools/cmed";
import { cnaeTools } from "./tools/cnae";
import { ibgeTools } from "./tools/ibge";
import { ibgeEconomiaTools } from "./tools/ibge-economia";
import { indexTools } from "./tools/index-tools";
import { legislacaoTools } from "./tools/legislacao";
import { painelPrecosTools } from "./tools/painel-precos";
import { pncpTools } from "./tools/pncp";
import { queridoDiarioTools } from "./tools/querido-diario";
import { receitaTools } from "./tools/receita";
import { sancoesTools } from "./tools/sancoes";
import { senadoTools } from "./tools/senado";
import { sicafTools } from "./tools/sicaf";
import { siconfiFiscalTools } from "./tools/siconfi-fiscal";
import { sinapiTools } from "./tools/sinapi";
import { tcuTools } from "./tools/tcu";
import { transparenciaDespesasTools } from "./tools/transparencia-despesas";
import { transferegovTools } from "./tools/transferegov";
import { tseTools } from "./tools/tse";

export const queryTools: readonly Tool[] = [
  ...legislacaoTools,
  ...ibgeTools,
  ...cnaeTools,
  ...catmatCatserTools,
  ...sicafTools,
  ...sancoesTools,
  ...receitaTools,
  ...tseTools,
  ...camaraTools,
  ...queridoDiarioTools,
  ...capagTools,
  ...pncpTools,
  ...tcuTools,
  ...ibgeEconomiaTools,
  ...senadoTools,
  ...cmedTools,
  ...siconfiFiscalTools,
  ...transferegovTools,
  ...painelPrecosTools,
  ...transparenciaDespesasTools,
  ...sinapiTools,
];

export const tools: readonly Tool[] = [
  ...queryTools,
  ...indexTools,
  statusIndices,
  ...skillTools,
];
