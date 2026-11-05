import { NodeHttpServer } from "@effect/platform-node";
import { Context, Deferred, Effect, Layer, Match, Predicate, Ref, Schema } from "effect";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Str from "effect/String";
import { HttpLive, HttpOriginOverride } from "../../../src/kernel/http/client";
import { HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

class FixtureServerError extends Schema.TaggedError<
  FixtureServerError,
  { readonly brand: unique symbol }
>()("FixtureServerError", { cause: Schema.String }) {}

type Reply = {
  readonly status?: number;
  readonly body?: string | Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  readonly hang?: boolean;
};

export type FixtureRoute = {
  readonly match: string | ((url: URL) => boolean);
  readonly respond: Reply | ((hit: number) => Reply);
};

export const pathIncludes =
  (fragment: string) =>
  (url: URL): boolean =>
    Str.includes(fragment)(url.pathname);

const matches = (route: FixtureRoute, url: URL): boolean =>
  Predicate.isString(route.match) ? url.pathname === route.match : route.match(url);

const resolveReply = (route: FixtureRoute, hit: number): Reply =>
  Predicate.isFunction(route.respond) ? route.respond(hit) : route.respond;

const notFound: Reply = { status: 404, body: "nao encontrado" };

const toResponse = (reply: Reply) =>
  Match.value(reply.body ?? "").pipe(
    Match.when(Predicate.isString, (body) =>
      HttpServerResponse.text(body, {
        status: reply.status ?? 200,
        ...(reply.headers === undefined ? {} : { headers: reply.headers }),
      })
    ),
    Match.orElse((body) =>
      HttpServerResponse.uint8Array(body, {
        status: reply.status ?? 200,
        ...(reply.headers === undefined ? {} : { headers: reply.headers }),
      })
    )
  );

export class FixtureServer extends Context.Service<
  FixtureServer,
  {
    readonly origin: string;
    readonly hits: (pathname: string) => Effect.Effect<number>;
  }
>()("dados-publicos-mcp/tests/unit/support/fixture-server/FixtureServer") {}

const serverLive = (routes: readonly FixtureRoute[]) =>
  Layer.effect(
    FixtureServer,
    Effect.gen(function* () {
      const release = yield* Deferred.make<void>();
      const counts = yield* Ref.make<ReadonlyMap<string, number>>(new Map());

      const handler = Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const url = new URL(request.url, "http://fixture.local");
        const hit = yield* Ref.modify(counts, (current) => {
          const next = (current.get(url.pathname) ?? 0) + 1;
          return [next, new Map(current).set(url.pathname, next)] as const;
        });
        const reply = Arr.findFirst(routes, (route) => matches(route, url)).pipe(
          Option.map((route) => resolveReply(route, hit)),
          Option.getOrElse(() => notFound)
        );
        yield* reply.hang === true ? Deferred.await(release) : Effect.void;
        return toResponse(reply);
      });

      yield* HttpServer.serveEffect(handler);
      yield* Effect.addFinalizer(() => Deferred.succeed(release, undefined));
      const origin = yield* HttpServer.addressFormattedWith(Effect.succeed);

      return {
        origin,
        hits: (pathname: string) =>
          Ref.get(counts).pipe(Effect.map((current) => current.get(pathname) ?? 0)),
      };
    })
  ).pipe(
    Layer.provide(NodeHttpServer.layerTest),
    Layer.catchTag("ServeError", (error) =>
      Layer.effect(FixtureServer, Effect.fail(FixtureServerError.make({ cause: String(error) })))
    )
  );

const overrideLive = Layer.effect(
  HttpOriginOverride,
  Effect.map(FixtureServer, ({ origin }) => Option.some(origin))
);

export const fixtureLayer = (routes: readonly FixtureRoute[]) =>
  Layer.mergeAll(HttpLive, overrideLive).pipe(Layer.provideMerge(serverLive(routes)));
