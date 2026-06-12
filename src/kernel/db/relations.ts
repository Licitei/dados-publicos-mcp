import { defineRelations } from "drizzle-orm";
import { cnae } from "./schemas/cnae";
import { municipio } from "./schemas/municipio";
import { node } from "./schemas/legislacao";

export const relations = defineRelations({ cnae, municipio, node });
