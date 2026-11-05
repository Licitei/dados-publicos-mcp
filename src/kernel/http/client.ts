import { Context, Duration, Effect, Layer, Match, Option, Schedule, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientResponse } from "effect/http";

const HttpErrorCode = Schema.Literals([
  "http.STATUS",
  "http.NETWORK",
  "http.TIMEOUT",
  "http.PARSE",
]);
type HttpErrorCode = (typeof HttpErrorCode)["Type"];

export class HttpError extends Schema.TaggedError<HttpError, { readonly brand: unique symbol }>()(
  "HttpError",
  {
    code: HttpErrorCode,
    url: Schema.String,
    status: Schema.optional(Schema.Finite),
    timeoutMs: Schema.optional(Schema.Finite),
    cause: Schema.optional(Schema.String),
  }
) {
  override get message() {
    switch (this.code) {
      case "http.STATUS":
        return `Falha ao baixar ${this.url}: HTTP ${this.status}`;
      case "http.NETWORK":
        return `Falha ao baixar ${this.url}: erro de rede`;
      case "http.TIMEOUT":
        return `Falha ao baixar ${this.url}: timeout depois de ${this.timeoutMs}ms`;
      case "http.PARSE":
        return `Falha ao interpretar a resposta de ${this.url}.`;
    }
  }
}

const HttpConfigSchema = Schema.Struct({
  userAgent: Schema.String,
  timeoutMs: Schema.Finite,
  maxRetries: Schema.Finite,
  retryBaseMillis: Schema.Finite,
  retryableStatus: Schema.ReadonlySet(Schema.Finite),
});
export type HttpConfig = (typeof HttpConfigSchema)["Type"];

export const HttpConfig = Context.Reference<HttpConfig>("dados-publicos-mcp/HttpConfig", {
  defaultValue: () => ({
    userAgent: "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)",
    timeoutMs: 30_000,
    maxRetries: 3,
    retryBaseMillis: 250,
    retryableStatus: new Set([408, 413, 429, 500, 502, 503, 504]),
  }),
});

const Options = Schema.Struct({
  timeoutMs: Schema.optional(Schema.Finite),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
type Options = (typeof Options)["Type"];

export const HttpOriginOverride = Context.Reference<Option.Option<string>>(
  "dados-publicos-mcp/HttpOriginOverride",
  { defaultValue: () => Option.none<string>() }
);

const HttpMetadata = Schema.Struct({
  status: Schema.Finite,
  headers: Schema.Record(Schema.String, Schema.String),
});

const HttpResponseData = Schema.Struct({
  status: Schema.Finite,
  headers: Schema.Record(Schema.String, Schema.String),
  bytes: Schema.Uint8Array,
});
type HttpResponseData = (typeof HttpResponseData)["Type"];

const rewriteOrigin = (origin: string, raw: string) => {
  const target = new URL(origin);
  const url = new URL(raw);
  url.protocol = target.protocol;
  url.host = target.host;
  return url.toString();
};

const makeHttp = Effect.gen(function* () {
  const client = yield* HttpClient.HttpClient;

  const fetchResponse = (url: string, opts?: Options, method: "get" | "head" = "get") =>
    Effect.gen(function* () {
      const cfg = yield* HttpConfig;
      const override = yield* HttpOriginOverride;
      const timeoutMs = opts?.timeoutMs ?? cfg.timeoutMs;
      const target = Option.match(override, {
        onNone: () => url,
        onSome: (origin) => rewriteOrigin(origin, url),
      });

      return yield* client[method](target, {
        headers: { "user-agent": cfg.userAgent, ...opts?.headers },
      }).pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.mapError((e) =>
          Match.value(e.reason).pipe(
            Match.tag("StatusCodeError", (r) =>
              HttpError.make({
                code: "http.STATUS",
                url,
                status: r.response.status,
              })
            ),
            Match.orElse((r) => HttpError.make({ code: "http.NETWORK", url, cause: String(r) }))
          )
        ),
        Effect.timeoutOrElse({
          duration: Duration.millis(timeoutMs),
          orElse: () => Effect.fail(HttpError.make({ code: "http.TIMEOUT", url, timeoutMs })),
        }),
        Effect.retry({
          schedule: Schedule.exponential(Duration.millis(cfg.retryBaseMillis)),
          times: cfg.maxRetries,
          while: Match.type<HttpError>().pipe(
            Match.when({ code: "http.STATUS" }, (e) => cfg.retryableStatus.has(e.status ?? -1)),
            Match.orElse(() => true)
          ),
        })
      );
    });

  const response = (url: string, opts?: Options) =>
    fetchResponse(url, opts).pipe(
      Effect.flatMap((res) =>
        res.arrayBuffer.pipe(
          Effect.mapBoth({
            onSuccess: (buffer): HttpResponseData => ({
              status: res.status,
              headers: res.headers,
              bytes: new Uint8Array(buffer),
            }),
            onFailure: (e) => HttpError.make({ code: "http.NETWORK", url, cause: String(e) }),
          })
        )
      )
    );

  const bytes = (url: string, opts?: Options) =>
    response(url, opts).pipe(Effect.map((res) => res.bytes));

  const text = (url: string, opts?: Options) =>
    bytes(url, opts).pipe(Effect.map((buffer) => new TextDecoder().decode(buffer)));

  const json = <S extends Schema.Top>(url: string, schema: S, opts?: Options) =>
    fetchResponse(url, opts).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
      Effect.mapError((e) =>
        Match.value(e).pipe(
          Match.tag("HttpError", (x) => x),
          Match.orElse((x) => HttpError.make({ code: "http.PARSE", url, cause: String(x) }))
        )
      )
    );

  const head = (url: string, opts?: Options) =>
    fetchResponse(url, opts, "head").pipe(
      Effect.map((res): (typeof HttpMetadata)["Type"] => ({
        status: res.status,
        headers: res.headers,
      }))
    );

  return { response, bytes, text, json, head };
});

export class Http extends Context.Service<Http, Effect.Success<typeof makeHttp>>()(
  "dados-publicos-mcp/kernel/http/client/Http"
) {}

export const HttpLive = Layer.effect(Http)(makeHttp).pipe(Layer.provide(FetchHttpClient.layer));
