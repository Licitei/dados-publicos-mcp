import type { PgTable } from "drizzle-orm/pg-core";
import { ata } from "../src/kernel/db/schemas/ata";
import { bem } from "../src/kernel/db/schemas/bem";
import { candidato } from "../src/kernel/db/schemas/candidato";
import { capagEstado } from "../src/kernel/db/schemas/capag-estado";
import { capagMunicipio } from "../src/kernel/db/schemas/capag-municipio";
import { ceapsDespesa } from "../src/kernel/db/schemas/ceaps-despesa";
import { catmatMaterial } from "../src/kernel/db/schemas/catmat-material";
import { catserService } from "../src/kernel/db/schemas/catser-service";
import { cnae } from "../src/kernel/db/schemas/cnae";
import { contratacao } from "../src/kernel/db/schemas/contratacao";
import { contrato } from "../src/kernel/db/schemas/contrato";
import { convenio } from "../src/kernel/db/schemas/convenio";
import { cota } from "../src/kernel/db/schemas/despesa-camara";
import { deputado } from "../src/kernel/db/schemas/deputado";
import { despesa } from "../src/kernel/db/schemas/despesa";
import { despesaFederal } from "../src/kernel/db/schemas/despesa-federal";
import { diario } from "../src/kernel/db/schemas/diario";
import { diarioCnpj } from "../src/kernel/db/schemas/diario-cnpj";
import { dominio } from "../src/kernel/db/schemas/dominio";
import { empresa } from "../src/kernel/db/schemas/empresa";
import { estabelecimento } from "../src/kernel/db/schemas/estabelecimento";
import { fornecedor } from "../src/kernel/db/schemas/fornecedor";
import { medicamentoCmed } from "../src/kernel/db/schemas/medicamento-cmed";
import { municipio } from "../src/kernel/db/schemas/municipio";
import { municipioEconomia } from "../src/kernel/db/schemas/municipio-economia";
import { node } from "../src/kernel/db/schemas/legislacao";
import { precoPraticado } from "../src/kernel/db/schemas/preco-praticado";
import { proposicao } from "../src/kernel/db/schemas/proposicao";
import { proposicaoAutor } from "../src/kernel/db/schemas/proposicao-autor";
import { receita } from "../src/kernel/db/schemas/receita";
import { receitaOriginario } from "../src/kernel/db/schemas/receita-originario";
import { sancao } from "../src/kernel/db/schemas/sancao";
import { senador } from "../src/kernel/db/schemas/senador";
import { siconfiEnte } from "../src/kernel/db/schemas/siconfi-ente";
import { siconfiFato } from "../src/kernel/db/schemas/siconfi-fato";
import { simples } from "../src/kernel/db/schemas/simples";
import { sinapiInsumo } from "../src/kernel/db/schemas/sinapi-insumo";
import { socio } from "../src/kernel/db/schemas/socio";
import { tcuInidoneo } from "../src/kernel/db/schemas/tcu-inidoneo";

export const allTables: readonly PgTable[] = [
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
];
