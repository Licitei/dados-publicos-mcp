/**
 * Barrel do modulo CAPAG.
 *
 * Exports principais para wiring no core (feito pela integracao):
 * - capagIndexAdapter: IndexAdapter (storage='sqlite', requiresHeavyDownload=false)
 * - registerCapagTools(server): registra as tools MCP
 */

export { capagIndexAdapter } from "./indexer";
export { registerCapagTools, callCapagTool } from "./tools";
