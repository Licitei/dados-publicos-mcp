import { homedir } from "node:os";
import { join } from "node:path";
import { panic } from "better-result";

const APP_DIR = "dados-publicos-mcp";

/**
 * Diretorio base de dados do MCP, consciente de plataforma.
 *
 * Ordem de resolucao:
 * 1. DADOS_PUBLICOS_MCP_DATA_DIR (override explicito);
 * 2. Windows: %LOCALAPPDATA% ou %APPDATA%;
 * 3. XDG_DATA_HOME (Linux/Unix);
 * 4. ~/.local/share (HOME ou os.homedir(), que cobre USERPROFILE no Windows).
 *
 * So da panic se nenhuma das fontes acima resolver um diretorio base.
 */
export function getDataDir(): string {
  const configured = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;

  if (configured) return configured;

  if (process.platform === "win32") {
    const winBase = process.env.LOCALAPPDATA ?? process.env.APPDATA;

    if (winBase) return join(winBase, APP_DIR);
  }

  const xdg = process.env.XDG_DATA_HOME;

  if (xdg) return join(xdg, APP_DIR);

  const home = process.env.HOME ?? homedir();

  if (!home) {
    panic(
      "Sem HOME/USERPROFILE; configure DADOS_PUBLICOS_MCP_DATA_DIR"
    );
  }

  return join(home, ".local", "share", APP_DIR);
}

/** Diretorio de um dominio: getDataDir()/<dominio>. */
export function dominioDir(dominio: string): string {
  return join(getDataDir(), dominio);
}

/** Caminho de um arquivo dentro do dominio: getDataDir()/<dominio>/<file>. */
export function dominioPath(dominio: string, file: string): string {
  return join(dominioDir(dominio), file);
}
