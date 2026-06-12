import type { IndexAdapter } from "./adapter";
import { legislacaoIndexAdapter } from "../sources/legislacao";
import { ibgeLocalidadesIndexAdapter } from "../modules/ibge-localidades/indexer";
import { cnaeIndexAdapter } from "../modules/cnae/indexer";
import { sancoesCguIndexAdapter } from "../modules/sancoes-cgu/indexer";
import { catmatCatserIndexAdapter } from "../modules/catmat-catser/indexer";
import { sicafFornecedoresIndexAdapter } from "../modules/sicaf-fornecedores/indexer";
import { capagIndexAdapter } from "../modules/capag/indexer";
import { receitaCnpjIndexAdapter } from "../modules/receita-cnpj/indexer";
import { tseEleitoralIndexAdapter } from "../modules/tse-eleitoral/indexer";
import { camaraDeputadosIndexAdapter } from "../modules/camara-deputados/indexer";
import { queridoDiarioIndexAdapter } from "../modules/querido-diario/indexer";
import { pncpBulkIndexAdapter } from "../modules/dados-publicos/pncp-indexer";

/**
 * Registro central de adapters de indice. Inclui a legislacao (Planalto)
 * e todas as fontes locais religadas na fase de integracao.
 */
export const adapters: IndexAdapter[] = [
  legislacaoIndexAdapter,
  ibgeLocalidadesIndexAdapter,
  cnaeIndexAdapter,
  sancoesCguIndexAdapter,
  catmatCatserIndexAdapter,
  sicafFornecedoresIndexAdapter,
  capagIndexAdapter,
  receitaCnpjIndexAdapter,
  tseEleitoralIndexAdapter,
  camaraDeputadosIndexAdapter,
  queridoDiarioIndexAdapter,
  pncpBulkIndexAdapter,
];

export function getAdapter(key: string): IndexAdapter | undefined {
  return adapters.find((adapter) => adapter.key === key);
}

export function listAdapters(): IndexAdapter[] {
  return [...adapters];
}
