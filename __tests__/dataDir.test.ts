import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import { getDataDir, dominioDir, dominioPath } from "../src/core/dataDir";

// O nome do diretorio da app esta embutido em src/core/dataDir.ts (APP_DIR).
// Mantemos uma copia local para construir as expectativas com path.join,
// sem nunca hardcodar barras ou backslashes.
const APP_DIR = "dados-publicos-mcp";

// Variaveis de ambiente que getDataDir() le, mais USERPROFILE que o homedir()
// do Node consulta no Windows. Salvamos/restauramos TODAS para isolar cada teste.
const ENV_KEYS = [
  "DADOS_PUBLICOS_MCP_DATA_DIR",
  "XDG_DATA_HOME",
  "HOME",
  "USERPROFILE",
  "APPDATA",
  "LOCALAPPDATA",
] as const;

// process.platform e somente-leitura; redefinimos via defineProperty para
// exercitar o ramo Windows independentemente do SO onde o teste roda.
const ORIGINAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
}

function restorePlatform(): void {
  Object.defineProperty(process, "platform", {
    value: ORIGINAL_PLATFORM,
    configurable: true,
  });
}

let savedEnv: Record<string, string | undefined>;

function clearEnv(): void {
  for (const key of ENV_KEYS) delete process.env[key];
}

beforeEach(() => {
  savedEnv = {};

  for (const key of ENV_KEYS) savedEnv[key] = process.env[key];

  clearEnv();
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];

    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  restorePlatform();
});

describe("getDataDir precedencia", () => {
  test("override explicito DADOS_PUBLICOS_MCP_DATA_DIR vence tudo", () => {
    // Mesmo com todas as outras fontes presentes, o override deve ganhar.
    const override = join("custom", "data", "location");

    process.env.DADOS_PUBLICOS_MCP_DATA_DIR = override;
    process.env.XDG_DATA_HOME = join("xdg", "base");
    process.env.HOME = join("home", "user");
    process.env.LOCALAPPDATA = join("win", "local");
    process.env.APPDATA = join("win", "roaming");
    process.env.USERPROFILE = join("win", "profile");

    // O override e retornado tal e qual, sem APP_DIR anexado.
    expect(getDataDir()).toBe(override);
  });

  test("ramo Windows: LOCALAPPDATA + APP_DIR (cross-platform)", () => {
    setPlatform("win32");

    const localAppData = join("C:", "Users", "Teste", "AppData", "Local");

    // Apenas a base do Windows definida; as demais fontes desligadas.
    process.env.LOCALAPPDATA = localAppData;

    const result = getDataDir();

    expect(result).toBe(join(localAppData, APP_DIR));
    expect(result.endsWith(join(localAppData, APP_DIR))).toBe(true);
  });

  test("ramo Windows: cai para APPDATA quando LOCALAPPDATA ausente", () => {
    setPlatform("win32");

    const appData = join("C:", "Users", "Teste", "AppData", "Roaming");

    process.env.APPDATA = appData;

    expect(getDataDir()).toBe(join(appData, APP_DIR));
  });

  test("ramo Windows: ignora bases win quando nao e win32", () => {
    // Em plataforma nao-Windows, LOCALAPPDATA/APPDATA nao sao consultados;
    // a resolucao cai para XDG_DATA_HOME.
    setPlatform("linux");

    process.env.LOCALAPPDATA = join("C:", "ignored", "local");
    process.env.APPDATA = join("C:", "ignored", "roaming");

    const xdg = join("xdg", "data", "home");

    process.env.XDG_DATA_HOME = xdg;

    expect(getDataDir()).toBe(join(xdg, APP_DIR));
  });

  test("ramo XDG_DATA_HOME + APP_DIR", () => {
    setPlatform("linux");

    const xdg = join("opt", "shared", "xdg");

    process.env.XDG_DATA_HOME = xdg;
    // HOME tambem presente, mas XDG tem precedencia sobre o fallback.
    process.env.HOME = join("home", "alguem");

    expect(getDataDir()).toBe(join(xdg, APP_DIR));
  });

  test("ramo fallback HOME/.local/share + APP_DIR", () => {
    setPlatform("linux");

    const home = join("home", "alguem");

    process.env.HOME = home;

    expect(getDataDir()).toBe(join(home, ".local", "share", APP_DIR));
  });

  test("erro quando nenhuma fonte de HOME resolve", () => {
    setPlatform("linux");

    // homedir() le do banco de usuarios do SO e quase sempre resolve algo,
    // mesmo sem HOME/USERPROFILE (limpos no beforeEach). Para exercitar
    // deterministicamente o ramo de panic, forcamos homedir() a devolver ""
    // via mock de node:os — mock.module patcha o binding ja importado.
    mock.module("node:os", () => ({ homedir: () => "" }));

    // Sem HOME, sem USERPROFILE e com homedir() vazio, deve dar panic (throw).
    expect(() => getDataDir()).toThrow(/HOME/);

    // Restaura o modulo real para nao vazar o stub para outros testes/arquivos.
    mock.restore();
  });
});

describe("dominioDir / dominioPath composicao", () => {
  test("dominioDir compoe base + dominio", () => {
    const base = join("var", "lib", "dados");

    // Usamos o override para fixar uma base conhecida.
    process.env.DADOS_PUBLICOS_MCP_DATA_DIR = base;

    expect(dominioDir("legislacao")).toBe(join(base, "legislacao"));
  });

  test("dominioPath compoe base + dominio + arquivo", () => {
    const base = join("var", "lib", "dados");

    process.env.DADOS_PUBLICOS_MCP_DATA_DIR = base;

    expect(dominioPath("legislacao", "leis.db")).toBe(
      join(base, "legislacao", "leis.db"),
    );
  });

  test("dominioPath concorda com getDataDir sob a mesma base", () => {
    const base = join("srv", "data", "root");

    process.env.DADOS_PUBLICOS_MCP_DATA_DIR = base;

    const expected = join(getDataDir(), "camara", "deputados.db");

    expect(dominioPath("camara", "deputados.db")).toBe(expected);
  });
});
