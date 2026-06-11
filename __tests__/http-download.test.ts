import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Result } from "better-result";
import {
  downloadToFile,
  fetchJson,
  fetchWithRetry,
} from "../src/core/http/download";

// ---------------------------------------------------------------------------
// Servidor local de fixtures: 127.0.0.1, porta 0 (atribuida pelo SO). O handler
// roteia por caminho para exercitar cada ramo do transporte HTTP.
// ---------------------------------------------------------------------------

// Contador de nivel de modulo: a primeira chamada em /flaky responde 503, as
// seguintes respondem 200, para exercitar RETRY -> sucesso.
let flakyHits = 0;

const JSON_BODY = { ok: true, items: [1, 2, 3], nome: "licitacao" };
const TEXT_BODY = "conteudo de texto simples\nsegunda linha";
const BINARY_BODY = new Uint8Array([0x00, 0x01, 0x02, 0xfe, 0xff, 0x42, 0x7f]);

let server: ReturnType<typeof Bun.serve>;
let base: string;

beforeAll(() => {
  server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      const { pathname } = new URL(req.url);

      switch (pathname) {
        case "/json":
          return Response.json(JSON_BODY);

        case "/text":
          return new Response(TEXT_BODY, {
            headers: {
              "content-type": "text/plain",
              "content-length": String(
                new TextEncoder().encode(TEXT_BODY).length
              ),
            },
          });

        case "/binary":
          return new Response(BINARY_BODY, {
            headers: {
              "content-type": "application/octet-stream",
              "content-length": String(BINARY_BODY.length),
            },
          });

        case "/flaky": {
          flakyHits += 1;

          if (flakyHits === 1) {
            return new Response("indisponivel", { status: 503 });
          }

          return Response.json({ recovered: true, hits: flakyHits });
        }

        case "/not-found":
          return new Response("nada aqui", { status: 404 });

        case "/server-error":
          // 500 e retryable: usado com retries=0 para virar STATUS imediato.
          return new Response("falha interna", { status: 500 });

        case "/no-content":
          return new Response(null, { status: 204 });

        case "/bad-json":
          return new Response("isto nao e json {{{", {
            headers: { "content-type": "application/json" },
          });

        case "/slow":
          // Atrasa MUITO alem do timeoutMs do teste para o abort disparar de
          // forma deterministica (sem corrida com a fase de conexao sob carga).
          await Bun.sleep(3_000);
          return new Response("tarde demais");

        default:
          return new Response("rota desconhecida", { status: 404 });
      }
    },
  });

  base = server.url.toString().replace(/\/$/, "");
});

afterAll(async () => {
  await server.stop(true);
});

// ---------------------------------------------------------------------------
// fetchWithRetry
// ---------------------------------------------------------------------------

describe("fetchWithRetry", () => {
  test("devolve Result.ok(Response) em 200 OK", async () => {
    const result = await fetchWithRetry(`${base}/json`);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value).toBeInstanceOf(Response);
      expect(result.value.ok).toBe(true);
      expect(result.value.status).toBe(200);
    }
  });

  test("retorna http.STATUS (nao-retryable) em 404 permanente", async () => {
    const result = await fetchWithRetry(`${base}/not-found`, undefined, {
      retries: 2,
      timeoutMs: 2_000,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.STATUS");
    }
  });

  test("retorna http.STATUS em 500 quando retries=0", async () => {
    const result = await fetchWithRetry(`${base}/server-error`, undefined, {
      retries: 0,
      timeoutMs: 2_000,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.STATUS");
    }
  });

  test("faz RETRY apos 503 e entao tem sucesso (contador > 1)", async () => {
    flakyHits = 0;

    const result = await fetchWithRetry(`${base}/flaky`, undefined, {
      retries: 2,
      timeoutMs: 2_000,
    });

    // O contador prova que a rota foi atingida mais de uma vez: 503 -> retry -> 200.
    expect(flakyHits).toBeGreaterThan(1);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value.status).toBe(200);
      const body = (await result.value.json()) as { recovered: boolean };
      expect(body.recovered).toBe(true);
    }
  });

  test("retorna http.TIMEOUT quando a resposta excede timeoutMs", async () => {
    const result = await fetchWithRetry(`${base}/slow`, undefined, {
      retries: 0,
      timeoutMs: 250,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.TIMEOUT");
    }
  });
});

// ---------------------------------------------------------------------------
// fetchJson
// ---------------------------------------------------------------------------

describe("fetchJson", () => {
  test("faz parse de um corpo JSON em 200", async () => {
    const result = await fetchJson<typeof JSON_BODY>(`${base}/json`);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value).toEqual(JSON_BODY);
    }
  });

  test("204 No Content vira Result.ok(null)", async () => {
    const result = await fetchJson(`${base}/no-content`);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value).toBeNull();
    }
  });

  test("mapeia falha de parse para http.PARSE", async () => {
    const result = await fetchJson(`${base}/bad-json`);

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.PARSE");
    }
  });

  test("propaga http.STATUS de uma rota 404", async () => {
    const result = await fetchJson(`${base}/not-found`, undefined, {
      retries: 0,
      timeoutMs: 2_000,
    });

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.STATUS");
    }
  });
});

// ---------------------------------------------------------------------------
// downloadToFile
// ---------------------------------------------------------------------------

describe("downloadToFile", () => {
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "dados-publicos-mcp-test-"));
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  test("escreve um corpo de texto no arquivo de destino", async () => {
    const dest = join(dir, "texto.txt");
    const result = await downloadToFile(`${base}/text`, dest);

    expect(Result.isOk(result)).toBe(true);

    if (Result.isOk(result)) {
      expect(result.value.endsWith(join("texto.txt"))).toBe(true);
    }

    const written = await Bun.file(dest).text();
    expect(written).toBe(TEXT_BODY);
  });

  test("escreve um corpo binario byte-a-byte", async () => {
    const dest = join(dir, "blob.bin");
    const result = await downloadToFile(`${base}/binary`, dest);

    expect(Result.isOk(result)).toBe(true);

    const bytes = await Bun.file(dest).bytes();
    expect(Array.from(bytes)).toEqual(Array.from(BINARY_BODY));
  });

  test("cria subdiretorios ausentes no caminho de destino", async () => {
    const dest = join(dir, "sub", "nested", "texto.txt");
    const result = await downloadToFile(`${base}/text`, dest);

    expect(Result.isOk(result)).toBe(true);

    const written = await Bun.file(dest).text();
    expect(written).toBe(TEXT_BODY);
  });

  test("dispara onProgress com (got, total)", async () => {
    const dest = join(dir, "progresso.txt");
    const calls: Array<[number, number]> = [];

    const result = await downloadToFile(`${base}/text`, dest, {
      onProgress: (got, total) => calls.push([got, total]),
    });

    expect(Result.isOk(result)).toBe(true);

    expect(calls.length).toBeGreaterThan(0);

    const expectedTotal = new TextEncoder().encode(TEXT_BODY).length;
    const [got, total] = calls[calls.length - 1];
    expect(total).toBe(expectedTotal);
    expect(got).toBe(expectedTotal);
  });

  test("propaga http.STATUS quando a origem responde 404", async () => {
    const dest = join(dir, "nao-deve-existir.txt");
    const result = await downloadToFile(`${base}/not-found`, dest);

    expect(Result.isError(result)).toBe(true);

    if (Result.isError(result)) {
      expect(result.error.code).toBe("http.STATUS");
    }

    // Nada deve ter sido escrito em disco no caminho de erro.
    expect(await Bun.file(dest).exists()).toBe(false);
  });
});
