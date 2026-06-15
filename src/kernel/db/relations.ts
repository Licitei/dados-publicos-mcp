import { defineRelations } from "drizzle-orm";
import { bem } from "./schemas/bem";
import { candidato } from "./schemas/candidato";
import { catmatMaterial } from "./schemas/catmat-material";
import { catserService } from "./schemas/catser-service";
import { cnae } from "./schemas/cnae";
import { cota } from "./schemas/despesa-camara";
import { deputado } from "./schemas/deputado";
import { despesa } from "./schemas/despesa";
import { fornecedor } from "./schemas/fornecedor";
import { proposicao } from "./schemas/proposicao";
import { proposicaoAutor } from "./schemas/proposicao-autor";
import { municipio } from "./schemas/municipio";
import { node } from "./schemas/legislacao";
import { receita } from "./schemas/receita";
import { receitaOriginario } from "./schemas/receita-originario";

export const relations = defineRelations({
  bem,
  candidato,
  catmatMaterial,
  catserService,
  cnae,
  cota,
  deputado,
  despesa,
  fornecedor,
  municipio,
  node,
  proposicao,
  proposicaoAutor,
  receita,
  receitaOriginario,
});
