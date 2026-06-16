import { Context, Duration, Effect, Match, Schedule, Schema } from "effect";
import { HttpClient, HttpClientResponse } from "effect/unstable/http";

const HttpErrorCode = Schema.Literals([
  "http.STATUS",
  "http.NETWORK",
  "http.TIMEOUT",
  "http.PARSE",
]);
export type HttpErrorCode = (typeof HttpErrorCode)["Type"];

export class HttpError extends Schema.TaggedErrorClass<HttpError>()("HttpError", {
  code: HttpErrorCode,
  url: Schema.String,
  status: Schema.optional(Schema.Number),
  timeoutMs: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.String),
}) {
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
  timeoutMs: Schema.Number,
  maxRetries: Schema.Number,
  retryBaseMillis: Schema.Number,
  retryableStatus: Schema.ReadonlySet(Schema.Number),
});
export type HttpConfig = (typeof HttpConfigSchema)["Type"];

export const HttpConfig = Context.Reference<HttpConfig>(
  "dados-publicos-mcp/HttpConfig",
  {
    defaultValue: () => ({
      userAgent:
        "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)",
      timeoutMs: 30_000,
      maxRetries: 3,
      retryBaseMillis: 250,
      retryableStatus: new Set([408, 413, 429, 500, 502, 503, 504]),
    }),
  }
);

export const Options = Schema.Struct({
  timeoutMs: Schema.optional(Schema.Number),
  headers: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type Options = (typeof Options)["Type"];

export const httpResponse = (url: string, opts?: Options) =>
  Effect.gen(function* () {
    const cfg = yield* HttpConfig;
    const timeoutMs = opts?.timeoutMs ?? cfg.timeoutMs;

    return yield* HttpClient.get(url, {
      headers: { "user-agent": cfg.userAgent, ...opts?.headers },
    }).pipe(
      Effect.flatMap(HttpClientResponse.filterStatusOk),
      Effect.mapError((e) =>
        Match.value(e.reason).pipe(
          Match.tag(
            "StatusCodeError",
            (r) =>
              new HttpError({ code: "http.STATUS", url, status: r.response.status })
          ),
          Match.orElse(
            (r) => new HttpError({ code: "http.NETWORK", url, cause: String(r) })
          )
        )
      ),
      Effect.timeout(Duration.millis(timeoutMs)),
      Effect.catchTag("TimeoutError", () =>
        Effect.fail(new HttpError({ code: "http.TIMEOUT", url, timeoutMs }))
      ),
      Effect.retry({
        schedule: Schedule.exponential(Duration.millis(cfg.retryBaseMillis)),
        times: cfg.maxRetries,
        while: Match.type<HttpError>().pipe(
          Match.when({ code: "http.STATUS" }, (e) =>
            cfg.retryableStatus.has(e.status ?? -1)
          ),
          Match.orElse(() => true)
        ),
      })
    );
  });

export function getJson<S extends Schema.Top>(
  url: string,
  schema: S,
  opts?: Options
) {
  return httpResponse(url, opts).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(schema)),
    Effect.mapError((e) =>
      Match.value(e).pipe(
        Match.tag("HttpError", (x) => x),
        Match.orElse(
          (x) => new HttpError({ code: "http.PARSE", url, cause: String(x) })
        )
      )
    )
  );
}
