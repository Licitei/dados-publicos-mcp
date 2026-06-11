import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import { z } from "zod";
import { createJsonStore } from "../src/core/store/json-store";

// ---------------------------------------------------------------------------
// Fixture: schema + tipo do dominio de teste.
// ---------------------------------------------------------------------------

const ItemSchema = z.object({
  id: z.number().int(),
  nome: z.string(),
  tags: z.array(z.string()),
});

const IndexSchema = z.object({
  versao: z.number().int(),
  itens: z.array(ItemSchema),
});

type Index = z.infer<typeof IndexSchema>;

const DOMINIO = "json-store-fixture";
const FILE = "index.json";

const sample: Index = {
  versao: 1,
  itens: [
    { id: 1, nome: "Alpha", tags: ["a", "b"] },
    { id: 2, nome: "Beta", tags: [] },
  ],
};

let dataDir: string;
let savedDataDirEnv: string | undefined;

beforeAll(async () => {
  savedDataDirEnv = process.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  // Diretorio fresco e isolado (cross-platform: tmpdir + join, sem "/tmp").
  dataDir = await mkdtemp(join(tmpdir(), "dados-publicos-mcp-test-"));
  process.env.DADOS_PUBLICOS_MCP_DATA_DIR = dataDir;
});

afterAll(async () => {
  if (savedDataDirEnv === undefined) {
    delete process.env.DADOS_PUBLICOS_MCP_DATA_DIR;
  } else {
    process.env.DADOS_PUBLICOS_MCP_DATA_DIR = savedDataDirEnv;
  }

  if (dataDir) await rm(dataDir, { recursive: true, force: true });
});

// Cada teste usa um dominio unico => cache de runtime e arquivo nao colidem
// entre cenarios (o cache do modulo e chaveado pelo caminho absoluto).
function freshStore(dominio: string) {
  return createJsonStore<Index>({
    dominio,
    file: FILE,
    schema: IndexSchema,
  });
}

describe("createJsonStore", () => {
  test("path() resolve dentro de DADOS_PUBLICOS_MCP_DATA_DIR/<dominio>/<file>", () => {
    const store = freshStore("path-d");
    const expected = join(dataDir, "path-d", FILE);

    expect(store.path()).toBe(expected);
  });

  test("store comeca vazio: arquivo nao existe e load()/get() retornam null", async () => {
    const store = freshStore("empty-d");

    expect(await Bun.file(store.path()).exists()).toBe(false);

    const loaded = await store.load();

    expect(Result.isOk(loaded)).toBe(true);
    expect(Result.isOk(loaded) && loaded.value).toBeNull();

    const got = await store.get();

    expect(Result.isOk(got)).toBe(true);
    expect(Result.isOk(got) && got.value).toBeNull();
  });

  test("save() grava o JSON no disco (Bun.write) e exists() vira true", async () => {
    const store = freshStore("save-d");

    expect(await Bun.file(store.path()).exists()).toBe(false);

    const result = await store.save(sample);

    expect(Result.isOk(result)).toBe(true);
    // save() devolve o caminho absoluto escrito.
    expect(Result.isOk(result) && result.value).toBe(store.path());

    expect(await Bun.file(store.path()).exists()).toBe(true);

    // O conteudo gravado e JSON pretty-printed com newline final.
    const onDisk = await Bun.file(store.path()).text();

    expect(onDisk).toBe(`${JSON.stringify(sample, null, 2)}\n`);
    expect(JSON.parse(onDisk)).toEqual(sample);
  });

  test("load() le do disco e faz round-trip pelo schema zod", async () => {
    const dominio = "roundtrip-d";
    const store = freshStore(dominio);

    await store.save(sample);

    // Store novo (mesmo dominio): forca releitura do disco via load().
    const fresh = freshStore(dominio);
    const loaded = await fresh.load();

    expect(Result.isOk(loaded)).toBe(true);

    if (Result.isOk(loaded)) {
      expect(loaded.value).toEqual(sample);
      // Round-trip pelo schema preserva tipos (numeros continuam numeros).
      expect(loaded.value?.versao).toBe(1);
      expect(loaded.value?.itens[0]?.id).toBe(1);
      expect(loaded.value?.itens[0]?.tags).toEqual(["a", "b"]);
    }
  });

  test("get() retorna o dado persistido apos save()", async () => {
    const store = freshStore("get-d");

    await store.save(sample);

    const got = await store.get();

    expect(Result.isOk(got)).toBe(true);
    expect(Result.isOk(got) && got.value).toEqual(sample);
  });

  test("cache em memoria devolve o mesmo dado sem reler o disco", async () => {
    const dominio = "cache-d";
    const store = freshStore(dominio);

    // save() popula o cache de runtime.
    await store.save(sample);

    // Corrompe o arquivo no disco. Se get() relesse o disco, o schema
    // falharia; como usa o cache, devolve o valor salvo intacto.
    await Bun.write(store.path(), "isto nao e json valido {");

    const got = await store.get();

    expect(Result.isOk(got)).toBe(true);
    expect(Result.isOk(got) && got.value).toEqual(sample);

    // load() sempre le do disco => agora deve falhar (prova que o disco
    // esta corrompido e que o get() acima veio do cache).
    const reloaded = await store.load();

    expect(Result.isError(reloaded)).toBe(true);
  });

  test("JSON sintaticamente invalido no disco surfa store.LEITURA", async () => {
    const dominio = "bad-syntax-d";
    const store = freshStore(dominio);

    // Garante diretorio e escreve payload com sintaxe JSON quebrada.
    await store.save(sample);
    await Bun.write(store.path(), "{ nao fecha");

    const loaded = await store.load();

    expect(Result.isError(loaded)).toBe(true);

    if (Result.isError(loaded)) {
      // handle.json() lanca => capturado como erro de LEITURA do catalogo.
      expect(loaded.error.code).toBe("store.LEITURA");
      expect(loaded.error.status).toBe(500);
    }
  });

  test("JSON valido mas fora do schema surfa store.CONTEUDO_INVALIDO", async () => {
    const dominio = "bad-schema-d";
    const store = freshStore(dominio);

    await store.save(sample);
    // JSON valido, porem nao casa com IndexSchema (itens deveria ser array).
    await Bun.write(
      store.path(),
      JSON.stringify({ versao: "nao-numero", itens: "x" }),
    );

    const loaded = await store.load();

    expect(Result.isError(loaded)).toBe(true);

    if (Result.isError(loaded)) {
      expect(loaded.error.code).toBe("store.CONTEUDO_INVALIDO");
      expect(loaded.error.status).toBe(500);
      // A mensagem inclui o caminho do arquivo afetado.
      expect(loaded.error.message).toContain(store.path());
    }
  });

  test("save() seguido de load() de store independente faz round-trip pelo disco", async () => {
    const dominio = "independent-d";
    const writer = freshStore(dominio);

    const saved = await writer.save(sample);

    expect(Result.isOk(saved)).toBe(true);

    // Outro store no mesmo dominio le o que foi persistido.
    const reader = freshStore(dominio);
    const loaded = await reader.load();

    expect(Result.isOk(loaded)).toBe(true);
    expect(Result.isOk(loaded) && loaded.value).toEqual(sample);
  });
});
