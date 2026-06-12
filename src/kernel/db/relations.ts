import { defineRelations } from "drizzle-orm";
import { municipio } from "./schemas/municipio";
import { node } from "./schemas/legislacao";

export const relations = defineRelations({ municipio, node });
