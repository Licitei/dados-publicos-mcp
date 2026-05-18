import { join } from "node:path";

export type DatasetId = "legislacao";

export function getDataDir() {
  if (Bun.env.DADOS_PUBLICOS_MCP_DATA_DIR) {
    return Bun.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  }

  if (Bun.env.XDG_DATA_HOME) {
    return join(Bun.env.XDG_DATA_HOME, "dados-publicos-mcp");
  }

  const home = Bun.env.HOME;

  if (!home) {
    throw new Error("HOME nao definido; configure DADOS_PUBLICOS_MCP_DATA_DIR");
  }

  return join(home, ".local", "share", "dados-publicos-mcp");
}

export function getDatasetDir(dataset: DatasetId) {
  return join(getDataDir(), dataset);
}

export function getDatasetFilePath(dataset: DatasetId, file: string) {
  return join(getDatasetDir(dataset), file);
}
