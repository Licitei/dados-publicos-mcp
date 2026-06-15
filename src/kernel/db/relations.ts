import { defineRelations } from "drizzle-orm";
import { catmatMaterial } from "./schemas/catmat-material";
import { catserService } from "./schemas/catser-service";
import { cnae } from "./schemas/cnae";
import { fornecedor } from "./schemas/fornecedor";
import { municipio } from "./schemas/municipio";
import { node } from "./schemas/legislacao";

export const relations = defineRelations({
  catmatMaterial,
  catserService,
  cnae,
  fornecedor,
  municipio,
  node,
});
