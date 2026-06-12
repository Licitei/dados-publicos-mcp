---
name: effect-v4-source-authoring
description: Use when adding or migrating a data Source into the v2 Effect-native slice (src/sources/<x>/ or src/kernel/**). The end-to-end gold-standard recipe — Schema.TaggedErrorClass taxonomy, Context.Service + Layer.effect, kernel http, bounded fan-out, classified retry, Match over switch — so the new slice passes the v2-strict static checks on the first try.
---

# Authoring a v2 Effect-native Source

The reference idiom is **`src/kernel/http/client.ts`**. Read it first — every rule below is something that file already does. The worked example of a full Source is **`src/sources/legislacao/`** (`catalog.ts` + `indexer.ts` + `store.ts`).

Strict rules apply only under `src/kernel/` and `src/sources/`. The enforcer is `tooling/static-checks/check-declarative-errors.ts` (AST, two tiers). Run `bun run check` — it is the only gate.

## The error taxonomy

One closed code set per domain, one tagged class, one `get message()` switch in pt-BR.

```ts
const XErrorCode = Schema.Literals(["x.NOT_FOUND", "x.PARSE"]);
export type XErrorCode = (typeof XErrorCode)["Type"];

export class XError extends Schema.TaggedErrorClass<XError>()("XError", {
  code: XErrorCode,
  url: Schema.optional(Schema.String),
}) {
  override get message() {
    switch (this.code) {
      case "x.NOT_FOUND":
        return `Não encontrado: ${this.url}`;
      case "x.PARSE":
        return `Falha ao interpretar ${this.url}.`;
    }
  }
}
```

- `extends Schema.TaggedErrorClass<Self>()("Name", {...})` — never `extends Error`, never `Data.TaggedError` (the `error-class-must-use-TaggedErrorClass` check rejects them; this supersedes ADR-0001/0002's `Data.TaggedError` wording).
- Build the error inline at the failure site: `Effect.fail(new XError({ code: "x.NOT_FOUND", url }))`. No `toXError` / `mapXError` / `wrapError` helpers (`no-error-helper-functions`).
- `switch` is legal **only** inside `get message()` (`switch-only-in-get-message`). Branch everywhere else with `Match`.
- Preserve source structure when it exists: extract the discriminant into a typed field (as the gold standard pulls `status` from `StatusCodeError`), not just `cause: String(x)`. `String(cause)` is the honest fallback only at genuinely opaque native boundaries (PGlite, transformers.js).

## The service

A service is a `Context.Service` whose shape is **inferred** from its `make` Effect, plus a `Layer.effect` export.

```ts
const makeX = Effect.gen(function* () {
  const db = yield* Db;
  return { query: (id: string) => db.select()./* ... */ };
});

export class X extends Context.Service<X, Effect.Success<typeof makeX>>()(
  "dados-publicos-mcp/X"
) {}

export const XLayer = Layer.effect(X)(makeX);
```

- `Effect.Success<typeof make>` for the shape — never hand-write the object type (it drifts).
- A `Context.Service` file **must** export its `Layer` (`service-needs-layer`).
- The v3 APIs `Context.Tag` / `Context.GenericTag` / `Effect.Tag` / `Effect.Service` are banned (`no-v3-service-api`).
- **Config** is a `Context.Reference` over a `Schema.Struct` with a `defaultValue` thunk — not a service, not banned. Use it for endpoints/timeouts/model names.

## Crossing boundaries

- **HTTP**: use the kernel — `httpResponse(url, opts)` for bytes/HTML, `getJson(url, Schema)` for JSON. Decoding JSON **must** go through a Schema so parse faults become a typed `http.PARSE`; never `response.json()` / `JSON.parse` raw (the deferred `no-raw-json-ingestion` idiom — enforce it by hand until a JSON Source lands).
- **Fan-out** to public gov.br hosts: always bounded — `Effect.forEach(items, f, { concurrency: 2 })`. `concurrency: "unbounded"` is banned (`no-unbounded-concurrency`); a rate-budgetless host will IP-ban a 47-wide burst.
- **Retry**: classify it — an options object with a `while:` predicate branching on `this.code`, or a single named `Schedule` policy. A blind `Effect.retry(schedule)` is rejected (`retry-must-classify-errors`). Retry transient codes only; deterministic parse/4xx-input errors must not retry.
- **Resources** (DB handles, model extractors): `Effect.acquireRelease` inside the `make`, never statement `try/finally`.

## The strict-tier laws (what the checks enforce)

Zero `throw` · zero `instanceof` · zero statement `try/catch/finally` · zero `as` casts (`as const`/`satisfies` ok) · zero `let`/`var` (fold with `reduce`) · zero `enum` · zero `while`/`do` · zero `++`/`+=` mutation · zero `-readonly` mapped types · no barrel pass-through re-exports · `switch` only in `get message()` · tagged-only error channel (never annotate `Effect.Effect<_, Error | unknown | any>` — let inference carry the union).

## Style

English everywhere — identifiers, files, folders, **no comments at all** (including JSDoc). pt-BR lives **only** inside user-facing error message strings. Prefer declared data + combinators (`Match`, `Layer`, `Schema`, `Effect.forEach`) over imperative glue. Deterministic order before any public output: a `LIMIT` query needs a total-order tiebreaker (`order by score desc, path`), or results differ run to run.

## Reality check

The v2 slice is reference architecture: `src/index.ts` still serves the **legacy** `src/modules/**` sources. Promoting a legacy Source means rebuilding it here to this idiom, then rewiring `serve`. Verify with `bun run check` (typecheck + lint + `bun test` + `vitest`) before finishing.
