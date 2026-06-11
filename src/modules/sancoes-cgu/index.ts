/**
 * Barrel do modulo de sancoes da CGU / Portal da Transparencia.
 *
 * Exports principais para o wiring do MCP:
 * - sancoesCguIndexAdapter: IndexAdapter (storage='sqlite', heavy=false)
 * - registerSancoesCguTools(server): registra as tools MCP
 */
export { sancoesCguIndexAdapter } from "./indexer";
export { registerSancoesCguTools, callSancoesCguTool } from "./tools";
export {
  verificarSancoes,
  buscarSancionadoPorNome,
  sancoesVigentesNaData,
} from "./service";
export { parseSancoes, parseEfeitos } from "./parse";
export { DOMINIO, DB_FILE, TITULO, DATASETS, zipUrl } from "./catalog";
