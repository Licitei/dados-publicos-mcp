import { expect, layer } from "@effect/vitest";
import { Effect, Schema } from "effect";
import { Http, HttpConfig } from "../../src/kernel/http/client";
import { FixtureServer, fixtureLayer } from "./support/fixture-server";

const JSON_TEXT = '{"ok":true,"items":[1,2,3],"name":"licitacao"}';
const JSON_BODY = { ok: true, items: [1, 2, 3], name: "licitacao" };

const BodySchema = Schema.Struct({
  ok: Schema.Boolean,
  items: Schema.Array(Schema.Finite),
  name: Schema.String,
});

const HttpFixture = fixtureLayer([
  { match: "/json", respond: { body: JSON_TEXT } },
  {
    match: "/flaky",
    respond: (hit) =>
      hit === 1 ? { status: 503, body: "indisponivel" } : { body: '{"recovered":true}' },
  },
  { match: "/down-a", respond: { status: 503, body: "indisponivel" } },
  { match: "/down-b", respond: { status: 503, body: "indisponivel" } },
  { match: "/not-found", respond: { status: 404, body: "nada aqui" } },
  {
    match: "/bad-json",
    respond: {
      body: "isto nao e json {{{",
      headers: { "content-type": "application/json" },
    },
  },
  { match: "/slow", respond: { body: "tarde", hang: true } },
]);

const noRetry = Effect.provideService(HttpConfig, {
  userAgent: "test",
  timeoutMs: 30_000,
  maxRetries: 0,
  retryBaseMillis: 1,
  retryableStatus: new Set<number>(),
});

const fastRetry = Effect.provideService(HttpConfig, {
  userAgent: "test",
  timeoutMs: 30_000,
  maxRetries: 2,
  retryBaseMillis: 5,
  retryableStatus: new Set<number>([503]),
});

const at = (path: string) => `https://upstream.example.test${path}`;

const getJson = <S extends Schema.Top>(url: string, schema: S) =>
  Effect.flatMap(Http, (http) => http.json(url, schema));

const response = (url: string, opts?: { readonly timeoutMs: number }) =>
  Effect.flatMap(Http, (http) => http.response(url, opts));

layer(HttpFixture, { excludeTestServices: true })("Http.json", (it) => {
  it.effect("decodes the body against the schema", () =>
    Effect.gen(function* () {
      const value = yield* getJson(at("/json"), BodySchema);
      expect(value).toEqual(JSON_BODY);
    })
  );

  it.effect("non-retryable 404 becomes http.STATUS", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(getJson(at("/not-found"), BodySchema));
      expect(error.code).toBe("http.STATUS");
      expect(error.status).toBe(404);
      expect(error.message).toContain("HTTP 404");
    })
  );

  it.effect("invalid JSON becomes http.PARSE", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(getJson(at("/bad-json"), BodySchema));
      expect(error.code).toBe("http.PARSE");
    })
  );

  it.effect("schema mismatch becomes http.PARSE", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        getJson(at("/json"), Schema.Struct({ missing: Schema.String }))
      );
      expect(error.code).toBe("http.PARSE");
    })
  );
});

layer(HttpFixture, { excludeTestServices: true })("Http.response", (it) => {
  it.effect("retries the backoff after 503 and then succeeds", () =>
    Effect.gen(function* () {
      const res = yield* response(at("/flaky"));
      const server = yield* FixtureServer;
      const hits = yield* server.hits("/flaky");
      expect(hits).toBe(2);
      expect(res.status).toBe(200);
    }).pipe(fastRetry)
  );

  it.effect("gives up after maxRetries on a persistent 503", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(response(at("/down-a")));
      const server = yield* FixtureServer;
      const hits = yield* server.hits("/down-a");
      expect(hits).toBe(3);
      expect(error.code).toBe("http.STATUS");
    }).pipe(fastRetry)
  );

  it.effect("interrupts on timeout with http.TIMEOUT", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(response(at("/slow"), { timeoutMs: 100 }));
      expect(error.code).toBe("http.TIMEOUT");
    }).pipe(noRetry)
  );

  it.effect("an overridden HttpConfig disables retries", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(response(at("/down-b")));
      const server = yield* FixtureServer;
      const hits = yield* server.hits("/down-b");
      expect(hits).toBe(1);
      expect(error.code).toBe("http.STATUS");
    }).pipe(noRetry)
  );
});
