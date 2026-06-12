# AGENTS.md — dados-publicos-mcp

MCP server (AGPL-3.0, **Bun + TypeScript**) that indexes Brazilian public-procurement
legislation and related public data **locally** and serves it to MCP clients over stdio.
Public data only — **zero secrets, zero API keys**. Each data source is a self-contained
vertical slice.

## Two worlds — read this first

The repo is mid-migration and lives in two layers at once. **Know which one you are in before
you write a line.**

| | **v2 — Effect-native (the target)** | **v1 — legacy (still the live serving path)** |
|---|---|---|
| Lives in | `src/kernel/**`, `src/sources/**` | `src/modules/**`, `src/core/**`, `src/index.ts` |
| Stack | Effect v4 + PGlite + Drizzle + local embeddings | `better-result` + `evlog` + `bun:sqlite`/JSON |
| Errors | `Schema.TaggedErrorClass` + `Effect.fail` | `Result<T, EvlogError>` |
| Identifiers | **English** (pt-BR only in error strings) | **pt-BR** domain language (`buscarLegislacao`, `dominio`) |
| Static rules | universal **+ v2-strict** tier | universal tier only |

`serve` (`src/index.ts`) currently registers the **legacy** `src/modules/legislacao/tools`, not
`src/sources/legislacao`. The v2 slice is **reference architecture awaiting promotion** — the
strict checks on it are forward-looking guardrails. Migration is module-by-module (see
`docs/ROADMAP_V2.md`, ADR-0001/0002), never a big-bang PR.

## Quick commands

```bash
bun install                       # Bun only — no npm/yarn/pnpm

bun run start                     # serve over stdio   (= bun src/index.ts serve)
bun run index                     # build all LIGHT indices
bun src/index.ts index legislacao            # one source
bun src/index.ts index --include-heavy       # include heavy downloads

bun run check                     # THE GATE — make it green before finishing any change
```

`bun run check` = `typecheck` (`tsc --noEmit`, the type gate — no `dist`, `src` ships as-is)
`+ lint:errors` `+ bun test` `+ test:unit` (`vitest run`). Integration suite is separate
(`vitest.integration.config.ts`). There is **no CI** — `check` is the only gate; `prepublishOnly`
re-runs it.

## The static checks (`bun run lint:errors`)

`tooling/static-checks/check-declarative-errors.ts` is **AST-based** (typescript compiler,
`ts.createSourceFile` walk) — not line-based. It dispatches on `ts.SyntaxKind` so it can tell a TS
`as` cast from a SQL `as` alias inside a `sql\`...\`` template. **Two tiers by path:**

**universal** (all of `src/`, legacy included):
`no-throw` · `no-instanceof` · `no-statement-try-catch-finally` · `no-error-helper-functions`
(`to*Error`/`map*Error`/`wrap*Error`/`*Failure`/`*Fault`, or any function returning an error).

**v2-strict** (`src/kernel/`, `src/sources/` only):
`no-as-cast` (`as const`/`satisfies` ok) · `no-let-var` · `no-enum` · `no-imperative-while-loop` ·
`no-mutation-accumulator` (`+=`/`++`) · `no-mutable-mapped-type` (`-readonly`) ·
`switch-only-in-get-message` · `error-class-must-use-TaggedErrorClass` ·
`error-code-discrimination` · `no-barrel-passthrough-reexport` ·
`retry-must-classify-errors` · `no-unbounded-concurrency` ·
`no-widened-effect-error-channel` (no `Effect.Effect<_, Error|unknown|any>`) ·
`no-v3-service-api` (no `Context.Tag`/`GenericTag`/`Effect.Tag`/`Effect.Service`) ·
`service-needs-layer`.

To **promote** a legacy module to strict enforcement, move it under `src/sources/` or
`src/kernel/`. To **add a rule**, see the `static-checks-authoring` skill — every rule must be
proven false-positive-clean on the six gold files first.

## v2 — Effect-native (the gold standard)

**`src/kernel/http/client.ts` is THE reference idiom.** Every v2 file copies its moves:

- **Closed sets**: `Schema.Literals([...])` + `export type X = (typeof X)["Type"]` — never `enum`.
- **Errors**: `class XError extends Schema.TaggedErrorClass<XError>()("XError", { code, ... })` with
  `override get message()` switching on `this.code` and returning pt-BR strings. Built inline at the
  failure site (`Effect.fail(new XError({ code, ... }))`), never via a helper. (This supersedes
  ADR-0001/0002's `Data.TaggedError` wording — the linter requires `Schema.TaggedErrorClass`.)
- **Config**: `Context.Reference` over a `Schema.Struct` with a `defaultValue` thunk (not a service).
- **Services**: `Context.Service<Self, Effect.Success<typeof make>>()` + an exported
  `Layer.effect(Service)(make)`. Shape **inferred** from `make`, never hand-written.
- **Branching**: `Match.value/.tag/.when/.orElse`, `Match.type<T>()` — `switch` only in `get message()`.
- **Effects**: pipe combinators (`Effect.flatMap`/`mapError`/`retry`/`catchTag`/`timeout`/`forEach`/
  `acquireRelease`/`tryPromise({ try, catch })`). Errors flow through `Effect.fail` — **never throw**.
- **Boundaries**: HTTP via the kernel (`getJson(url, Schema)` decodes JSON through a Schema so parse
  faults become a typed `http.PARSE`; never `response.json()`/`JSON.parse` raw). Fan-out to gov.br is
  **bounded** (`Effect.forEach(xs, f, { concurrency: 2 })`). Retry is **classified** (a `while:`
  predicate on `this.code`, or a named `Schedule`). Resources via `Effect.acquireRelease`.
- **Determinism**: any `LIMIT` query needs a total-order tiebreaker (`order by score desc, path`).

**Style** (also ADR-0002): English identifiers/files/folders; **no code comments, including JSDoc**;
pt-BR **only** in user-facing error strings; **no barrel/passthrough re-exports** (import from the
source module); declared data + combinators over imperative glue.

Stack: Effect `4.0.0-beta.81` (`effect/unstable/http`, `effect/unstable/reactivity` are normal v4
imports) · PGlite over a unix socket via `pglite-socket` · `@effect/sql-pg` `PgClient` ·
`drizzle-orm/effect-postgres` · `@huggingface/transformers` local embeddings · `vector` + `bm25`
(`pg_textsearch`) + `ltree`, RRF hybrid search. Adding a Source: use the
`effect-v4-source-authoring` skill; the worked example is `src/sources/legislacao/`.

## v1 — legacy (still serving)

Core defines one adapter contract; every source in `src/modules/<x>/` implements it and registers in
`src/core/registry.ts`. The CLI/`serve()` iterate the registry. Vertical slice:
`tools.ts` (MCP) → `service.ts` (read queries) → `indexer.ts` (build) → `store.ts` (schema) →
`errors.ts` (`defineErrorCatalog`). `adapter.key` MUST equal the data-dir folder name.

- **Errors as values**: `Result<T, EvlogError>` from `better-result`; functions **return** errors,
  never `throw`/`try/catch`. Build the catalog error inline in a `Result.tryPromise({ try, catch })`
  handler or at a guard. One `defineErrorCatalog('<domain>', {...})` per module (+ the
  `declare module 'evlog'` augmentation), `SCREAMING_SNAKE_CASE` keys, pt-BR `message`/`why`/`fix`.
  `panic(msg)` only for impossible invariants. No error helper/wrapper functions.
- **DB singleton**: open via `getDb`/`openDb`/`openReadonly` from `core/store/sqlite-store.ts` — each
  `(path, mode)` opened once per process. **Never** `new Database(...)` in a module, **never**
  `db.close()` (the `process.on("exit", closeAllDbs)` hook owns lifetime). Reads use `openReadonly`
  after a `dbExists` guard; builds use `openDb`; rebuilds are in-place (`DELETE FROM` / `CREATE … IF
  NOT EXISTS`) — no module deletes its `.db` file.
- **100% bun-native I/O**: `Bun.file`/`Bun.write`/`Bun.inflateSync`. Blessed `node:` retains:
  `node:path`, `node:os` `homedir`, `node:fs` `mkdirSync`, `node:fs/promises` `mkdir`, `node:zlib`
  `crc32`, test-only `mkdtemp`/`tmpdir`.
- **pt-BR domain language** here (`buscarLegislacao`, `dominio`, `registros`) — v1 only; v2 is English.

## Tests

- **`bun:test`** (`__tests__/<domain>.test.ts`): Bun APIs, `bun:sqlite`, local
  `Bun.serve({ hostname: "127.0.0.1", port: 0 })`. Matched by `bun test`.
- **`@effect/vitest`** (`tests/unit/*.unit.test.ts`, `tests/integration/*.integration.test.ts`):
  `it.effect` runs the Effect with a `TestContext`; stub I/O via injected layers (e.g.
  `FetchHttpClient.Fetch`); drive retry/timeout with `TestClock`. Runs under Node — no Bun APIs.
- **No public network** in either runner; cross-platform temp via `mkdtemp(join(tmpdir(), …))`; bind
  servers to `127.0.0.1:0`. Generated indices (`*.db`, `.cache/`) are gitignored, under
  `getDataDir()` (`~/.local/share/dados-publicos-mcp/`, override `DADOS_PUBLICOS_MCP_DATA_DIR`).

## Pointers

Architecture decisions: `docs/adr/0001-effect-pglite.md`, `docs/adr/0002-declarative-architecture-and-folders.md`.
Domain vocabulary: `CONTEXT.md`. Roadmap: `docs/ROADMAP_V2.md`. Skills: `effect-v4-source-authoring`,
`static-checks-authoring`. **AGPL-3.0-only** — published artifacts are `src/` + `README.md` + `LICENSE`.
