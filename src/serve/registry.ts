import { skillTools } from "./skills";
import { statusIndices } from "./status";
import { withLazyIndex } from "./lazy";
import type { Tool } from "./tool";
import { camaraTools } from "./tools/camara";
import { capagTools } from "./tools/capag";
import { catmatCatserTools } from "./tools/catmat-catser";
import { cmedTools } from "./tools/cmed";
import { cnaeTools } from "./tools/cnae";
import { ibgeTools } from "./tools/ibge";
import { ibgeEconomiaTools } from "./tools/ibge-economia";
import { indexTools } from "./tools/index-tools";
import { acervoTools } from "./tools/acervos";
import { perfilTools } from "./tools/perfil";
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

const queryTools: readonly Tool[] = [
  ...acervoTools,
  ...perfilTools,
  ...withLazyIndex(ibgeTools, "ibge-localidades"),
  ...withLazyIndex(cnaeTools, "cnae"),
  ...withLazyIndex(catmatCatserTools, "catmat-catser"),
  ...withLazyIndex(sicafTools, "sicaf-fornecedores"),
  ...withLazyIndex(sancoesTools, "sancoes-cgu"),
  ...receitaTools,
  ...tseTools,
  ...camaraTools,
  ...queridoDiarioTools,
  ...withLazyIndex(capagTools, "capag"),
  ...pncpTools,
  ...withLazyIndex(tcuTools, "tcu-inidoneos"),
  ...withLazyIndex(ibgeEconomiaTools, "ibge-economia"),
  ...withLazyIndex(senadoTools, "senado"),
  ...withLazyIndex(cmedTools, "cmed-anvisa"),
  ...siconfiFiscalTools,
  ...transferegovTools,
  ...painelPrecosTools,
  ...transparenciaDespesasTools,
  ...sinapiTools,
];

export const tools: readonly Tool[] = [...queryTools, ...indexTools, statusIndices, ...skillTools];
