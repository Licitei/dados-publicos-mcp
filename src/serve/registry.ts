import { guia } from "./skills";
import { fontes } from "./status";
import type { Tool } from "./tool";
import { acervoTools } from "./tools/acervos";
import { buscar } from "./tools/buscar";
import { indexTools } from "./tools/index-tools";
import { consultarSql } from "./tools/sql";

export const tools: readonly Tool[] = [
  fontes,
  consultarSql,
  buscar,
  ...acervoTools,
  ...indexTools,
  guia,
];
