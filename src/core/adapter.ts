import type { Result } from "better-result";
import type { EvlogError } from "evlog";

/**
 * Canal de erro dos adapters.
 *
 * EvlogError declarativo (catalogos evlog, estilo dfe-kit). Todos os modulos
 * ja foram convertidos para o estilo declarativo, entao este e o unico canal
 * de erro: construa-os inline a partir do catalogo evlog do dominio.
 */
export type AdapterError = EvlogError;

export type StorageKind = "json" | "sqlite" | "memory";

export type BuildOptions = {
  scope?: Record<string, unknown>;
  onProgress?: (msg: string) => void;
  includeHeavy?: boolean;
};

export type BuildSummary = {
  dominio: string;
  registros: number;
  atualizadoEm: string;
  caminho: string;
  detalhes?: Record<string, unknown>;
};

export type StatusInfo = {
  key: string;
  titulo: string;
  storage: StorageKind;
  requiresHeavyDownload: boolean;
  existe: boolean;
  atualizadoEm: string | null;
  registros: number | null;
  caminho: string;
};

/**
 * Contrato comum de todos os indices/dominios do MCP.
 * Cada modulo expoe um adapter para build/status uniformes.
 */
export interface IndexAdapter {
  key: string;
  titulo: string;
  storage: StorageKind;
  requiresHeavyDownload: boolean;
  build(opts?: BuildOptions): Promise<Result<BuildSummary, AdapterError>>;
  status(): Promise<Result<StatusInfo, AdapterError>>;
}
