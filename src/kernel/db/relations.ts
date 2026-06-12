import { defineRelations } from "drizzle-orm";
import { cnae } from "./schemas/cnae";
import { fornecedor } from "./schemas/fornecedor";
import { municipio } from "./schemas/municipio";
import { node } from "./schemas/legislacao";

export const relations = defineRelations({ cnae, fornecedor, municipio, node });
