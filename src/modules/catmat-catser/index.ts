/**
 * Barrel do modulo CATMAT/CATSER.
 *
 * Pontos de integracao (consumidos pelo wiring central):
 *   - catmatCatserIndexAdapter: IndexAdapter (storage 'sqlite', heavy false)
 *   - registerCatmatCatserTools(server): registra as tools MCP
 */

export {
  catmatCatserIndexAdapter,
  openCatmatCatserDb,
  dbPath,
  type CatmatIndexError,
} from "./indexer";
export { catmatCatserErrors } from "./errors";
export { registerCatmatCatserTools } from "./tools";
export * from "./service";
export * from "./schema";
export * from "./store";
export * from "./catalog";
