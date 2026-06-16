import { describe, expect, it } from "@effect/vitest";
import { Duration, Effect, Fiber, Layer, Schema } from "effect";
import { TestClock } from "effect/testing";
import { FetchHttpClient } from "effect/unstable/http";
import { getJson, HttpConfig, httpResponse } from "../../src/kernel/http/client";

const JSON_BODY = { ok: true, items: [1, 2, 3], name: "licitacao" };

const BodySchema = Schema.Struct({
  ok: Schema.Boolean,
  items: Schema.Array(Schema.Number),
  name: Schema.String,
});

let flakyHits = 0;

const route = async (input: string | URL | Request): Promise<Response> => {
  const path = new URL(String(input)).pathname;

  switch (path) {
    case "/json":
      return Response.json(JSON_BODY);
    case "/flaky":
      flakyHits += 1;
      return flakyHits === 1
        ? new Response("indisponivel", { status: 503 })
        : Response.json({ recovered: true });
    case "/not-found":
      return new Response("nada aqui", { status: 404 });
    case "/bad-json":
      return new Response("isto nao e json {{{", {
        headers: { "content-type": "application/json" },
      });
    case "/never":
      return new Promise<Response>(() => {});
    default:
      return new Response("rota desconhecida", { status: 404 });
  }
};

const stub = Object.assign(route, {
  preconnect: () => {},
}) satisfies typeof fetch;

const HttpStub = FetchHttpClient.layer.pipe(
  Layer.provide(Layer.succeed(FetchHttpClient.Fetch, stub))
);

const noRetry = Effect.provideService(HttpConfig, {
  userAgent: "test",
  timeoutMs: 30_000,
  maxRetries: 0,
  retryBaseMillis: 1,
  retryableStatus: new Set<number>(),
});

const at = (path: string) => `http://stub.test${path}`;

describe("getJson", () => {
  it.effect("decodes the body against the schema", () =>
    Effect.gen(function* () {
      const value = yield* getJson(at("/json"), BodySchema);
      expect(value).toEqual(JSON_BODY);
    }).pipe(Effect.provide(HttpStub))
  );

  it.effect("non-retryable 404 becomes http.STATUS", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(getJson(at("/not-found"), BodySchema));
      expect(error.code).toBe("http.STATUS");
      expect(error.status).toBe(404);
      expect(error.message).toContain("HTTP 404");
    }).pipe(Effect.provide(HttpStub))
  );

  it.effect("invalid JSON becomes http.PARSE", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(getJson(at("/bad-json"), BodySchema));
      expect(error.code).toBe("http.PARSE");
    }).pipe(Effect.provide(HttpStub))
  );

  it.effect("schema mismatch becomes http.PARSE", () =>
    Effect.gen(function* () {
      const error = yield* Effect.flip(
        getJson(at("/json"), Schema.Struct({ missing: Schema.String }))
      );
      expect(error.code).toBe("http.PARSE");
    }).pipe(Effect.provide(HttpStub))
  );
});

describe("httpResponse", () => {
  it.effect("retries the backoff after 503 and then succeeds", () =>
    Effect.gen(function* () {
      flakyHits = 0;
      const fiber = yield* Effect.forkChild(httpResponse(at("/flaky")));
      yield* TestClock.adjust(Duration.seconds(1));
      const res = yield* Fiber.join(fiber);

      expect(flakyHits).toBe(2);
      expect(res.status).toBe(200);
    }).pipe(Effect.provide(HttpStub))
  );

  it.effect("interrupts on timeout with http.TIMEOUT", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(
        Effect.flip(httpResponse(at("/never"), { timeoutMs: 100 }))
      );
      yield* TestClock.adjust(Duration.millis(100));
      const error = yield* Fiber.join(fiber);

      expect(error.code).toBe("http.TIMEOUT");
    }).pipe(noRetry, Effect.provide(HttpStub))
  );

  it.effect("an overridden HttpConfig disables retries", () =>
    Effect.gen(function* () {
      flakyHits = 0;
      const error = yield* Effect.flip(httpResponse(at("/flaky")));

      expect(flakyHits).toBe(1);
      expect(error.code).toBe("http.STATUS");
    }).pipe(noRetry, Effect.provide(HttpStub))
  );
});
