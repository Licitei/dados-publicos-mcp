import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { dominioPath } from "../src/core/dataDir";
import {
  batchInsert,
  closeAllDbs,
  countRows,
  dbExists,
  getDb,
  openDb,
  openReadonly,
} from "../src/core/store/sqlite-store";

// Diretorio de dados isolado por execucao. getDataDir() le a env a cada
// chamada, entao basta defini-la antes de qualquer uso de dominioPath/openDb.
let dataDir: string;
const savedDataDir = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;

const DOMINIO = "store-test";

beforeAll(async () => {
  dataDir = await mkdtemp(join(tmpdir(), "dados-publicos-mcp-test-"));
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = dataDir;
});

afterAll(async () => {
  // Nao vazar o singleton para outros arquivos de teste e liberar handles
  // antes de remover o diretorio temporario.
  closeAllDbs();

  if (savedDataDir === undefined) delete process.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  else process.env.DADOS_PUBLICOS_MCP_DATA_DIR = savedDataDir;

  await rm(dataDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// getDb singleton (cache por caminho + modo)
// ---------------------------------------------------------------------------

describe("getDb singleton", () => {
  test("reusa a MESMA instancia em chamadas repetidas (cache)", () => {
    const abs = join(dataDir, "singleton", "index.sqlite");
    const first = getDb(abs);
    const second = getDb(abs);

    expect(second).toBe(first);
  });

  test("ro e rw sao instancias DIFERENTES (chaves de cache distintas)", () => {
    const abs = join(dataDir, "singleton", "index.sqlite");
    // rw foi criado no teste anterior; cria o arquivo para o ro poder abrir.
    const rw = getDb(abs);

    rw.exec("CREATE TABLE IF NOT EXISTS t (id INTEGER)");

    const ro = getDb(abs, { readonly: true });

    expect(ro).not.toBe(rw);
    // E o ro deve reusar a si mesmo.
    expect(getDb(abs, { readonly: true })).toBe(ro);
  });
});

// ---------------------------------------------------------------------------
// openDb / openReadonly delegam para getDb por dominio
// ---------------------------------------------------------------------------

describe("openDb / openReadonly", () => {
  test("openDb delega para getDb (mesma instancia que getDb no caminho do dominio)", () => {
    const db = openDb(DOMINIO);
    const viaPath = getDb(dominioPath(DOMINIO, "index.sqlite"));

    expect(viaPath).toBe(db);
  });

  test("openReadonly delega para getDb readonly do dominio", () => {
    // openDb ja criou o arquivo do dominio acima.
    const ro = openReadonly(DOMINIO);
    const viaPath = getDb(dominioPath(DOMINIO, "index.sqlite"), {
      readonly: true,
    });

    expect(viaPath).toBe(ro);
    expect(ro).not.toBe(openDb(DOMINIO));
  });

  test("openReadonly LANCA em arquivo inexistente (ro nao cria)", () => {
    // Dominio nunca tocado: nenhum arquivo .sqlite existe.
    expect(() => openReadonly("dominio-inexistente-ro")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// dbExists (Bun.file(path).size > 0)
// ---------------------------------------------------------------------------

describe("dbExists", () => {
  test("false antes de existir, true depois de openDb + escrita", () => {
    const dominio = "exists-test";

    expect(dbExists(dominio)).toBe(false);

    const db = openDb(dominio);

    // Garante bytes em disco: cria tabela e insere uma linha.
    db.exec("CREATE TABLE IF NOT EXISTS marca (id INTEGER)");
    db.exec("INSERT INTO marca (id) VALUES (1)");

    expect(dbExists(dominio)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// batchInsert + countRows
// ---------------------------------------------------------------------------

describe("batchInsert + countRows", () => {
  test("insere em lote numa transacao e conta as linhas", () => {
    const db = openDb("batch-test");

    db.exec("CREATE TABLE IF NOT EXISTS itens (id INTEGER, nome TEXT)");

    type Item = { id: number; nome: string };
    const rows: Item[] = Array.from({ length: 250 }, (_, i) => ({
      id: i,
      nome: `item-${i}`,
    }));

    batchInsert(
      db,
      "INSERT INTO itens (id, nome) VALUES (?, ?)",
      rows,
      (r) => [r.id, r.nome],
      100 // batch menor que rows.length para exercer multiplos chunks
    );

    expect(countRows(db, "itens")).toBe(250);
  });

  test("batchInsert com lista vazia e no-op", () => {
    const db = openDb("batch-empty");

    db.exec("CREATE TABLE IF NOT EXISTS vazia (id INTEGER)");

    batchInsert(db, "INSERT INTO vazia (id) VALUES (?)", [], () => []);

    expect(countRows(db, "vazia")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// closeAllDbs e reabertura — DEVE ser o ultimo bloco deste arquivo
// ---------------------------------------------------------------------------

describe("closeAllDbs", () => {
  test("apos fechar tudo, getDb devolve um handle funcional de novo", () => {
    const abs = join(dataDir, "reabre", "index.sqlite");
    const before = getDb(abs);

    before.exec("CREATE TABLE IF NOT EXISTS reabre (id INTEGER)");

    closeAllDbs();

    const after = getDb(abs);

    // Cache foi limpo: nova instancia.
    expect(after).not.toBe(before);

    // E o handle funciona (le a tabela persistida em disco).
    after.exec("INSERT INTO reabre (id) VALUES (1)");
    expect(countRows(after, "reabre")).toBe(1);
  });
});
