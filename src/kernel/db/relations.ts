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
import { cota } from "./schemas/despesa-camara";
import { deputado } from "./schemas/deputado";
import { despesa } from "./schemas/despesa";
import { diario } from "./schemas/diario";
import { diarioCnpj } from "./schemas/diario-cnpj";
import { dominio } from "./schemas/dominio";
import { empresa } from "./schemas/empresa";
import { estabelecimento } from "./schemas/estabelecimento";
import { fornecedor } from "./schemas/fornecedor";
import { proposicao } from "./schemas/proposicao";
import { proposicaoAutor } from "./schemas/proposicao-autor";
import { municipio } from "./schemas/municipio";
import { municipioEconomia } from "./schemas/municipio-economia";
import { node } from "./schemas/legislacao";
import { receita } from "./schemas/receita";
import { receitaOriginario } from "./schemas/receita-originario";
import { sancao } from "./schemas/sancao";
import { senador } from "./schemas/senador";
import { siconfiEnte } from "./schemas/siconfi-ente";
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
  cota,
  deputado,
  despesa,
  diario,
  diarioCnpj,
  dominio,
  empresa,
  estabelecimento,
  fornecedor,
  municipio,
  municipioEconomia,
  node,
  proposicao,
  proposicaoAutor,
  receita,
  receitaOriginario,
  sancao,
  senador,
  siconfiEnte,
  simples,
  socio,
  tcuInidoneo,
});
