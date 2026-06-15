import { defineRelations } from "drizzle-orm";
import { bem } from "./schemas/bem";
import { candidato } from "./schemas/candidato";
import { catmatMaterial } from "./schemas/catmat-material";
import { catserService } from "./schemas/catser-service";
import { cnae } from "./schemas/cnae";
import { despesa } from "./schemas/despesa";
import { fornecedor } from "./schemas/fornecedor";
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
  despesa,
  fornecedor,
  municipio,
  node,
  receita,
  receitaOriginario,
});
