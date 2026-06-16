import { defineRelations } from "drizzle-orm";
import { ata } from "./schemas/ata";
import { bem } from "./schemas/bem";
import { candidato } from "./schemas/candidato";
import { capagEstado } from "./schemas/capag-estado";
import { ceapsDespesa } from "./schemas/ceaps-despesa";
import { capagMunicipio } from "./schemas/capag-municipio";
import { catmatMaterial } from "./schemas/catmat-material";
import { catserService } from "./schemas/catser-service";
import { cnae } from "./schemas/cnae";
import { contratacao } from "./schemas/contratacao";
import { contrato } from "./schemas/contrato";
import { convenio } from "./schemas/convenio";
import { cota } from "./schemas/despesa-camara";
import { deputado } from "./schemas/deputado";
import { despesa } from "./schemas/despesa";
import { despesaFederal } from "./schemas/despesa-federal";
import { diario } from "./schemas/diario";
import { diarioCnpj } from "./schemas/diario-cnpj";
import { dominio } from "./schemas/dominio";
import { empresa } from "./schemas/empresa";
import { estabelecimento } from "./schemas/estabelecimento";
import { fornecedor } from "./schemas/fornecedor";
import { medicamentoCmed } from "./schemas/medicamento-cmed";
import { proposicao } from "./schemas/proposicao";
import { proposicaoAutor } from "./schemas/proposicao-autor";
import { municipio } from "./schemas/municipio";
import { municipioEconomia } from "./schemas/municipio-economia";
import { node } from "./schemas/legislacao";
import { precoPraticado } from "./schemas/preco-praticado";
import { receita } from "./schemas/receita";
import { receitaOriginario } from "./schemas/receita-originario";
import { sancao } from "./schemas/sancao";
import { senador } from "./schemas/senador";
import { siconfiEnte } from "./schemas/siconfi-ente";
import { siconfiFato } from "./schemas/siconfi-fato";
import { sinapiInsumo } from "./schemas/sinapi-insumo";
import { simples } from "./schemas/simples";
import { socio } from "./schemas/socio";
import { tcuInidoneo } from "./schemas/tcu-inidoneo";

export const relations = defineRelations({
  ata,
  bem,
  candidato,
  capagEstado,
  capagMunicipio,
  ceapsDespesa,
  catmatMaterial,
  catserService,
  cnae,
  contratacao,
  contrato,
  convenio,
  cota,
  deputado,
  despesa,
  despesaFederal,
  diario,
  diarioCnpj,
  dominio,
  empresa,
  estabelecimento,
  fornecedor,
  medicamentoCmed,
  municipio,
  municipioEconomia,
  node,
  precoPraticado,
  proposicao,
  proposicaoAutor,
  receita,
  receitaOriginario,
  sancao,
  senador,
  siconfiEnte,
  siconfiFato,
  simples,
  sinapiInsumo,
  socio,
  tcuInidoneo,
});
