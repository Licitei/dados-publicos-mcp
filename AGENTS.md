# AGENTS.md — dados-publicos-mcp

MCP server (AGPL-3.0, **Bun + TypeScript + Effect v4**) that indexes Brazilian public-procurement
legislation and related public data **locally** and serves it to MCP clients over stdio. Public data
only — **zero secrets, zero API keys**. Each data source is a self-contained vertical slice over one
shared local database.

## One world — Effect-native

The v1→v2 cutover has landed. **There is no legacy layer anymore.** The whole tree is the
Effect-native v2 world: `better-result`, `evlog`, `zod`, `dayjs`, `bun:sqlite`, `cac`,
`src/modules/**` and `src/core/**` are **deleted**. There is one PGlite database, one tool layer over
the low-level MCP SDK `Server`, and one CLI. Every file you touch follows the v2 idiom below.

| | **v2 — the only world** |
|---|---|
| Lives in | `src/kernel/**`, `src/sources/**`, `src/serve/**`, `src/runtime.ts`, `src/index.ts` |
| Stack | Effect `4.0.0-beta.81` + PGlite + Drizzle + local embeddings |
| Errors | `Schema.TaggedErrorClass` + `Effect.fail` (never `throw`) |
| Identifiers | **English** — pt-BR **only** inside user-facing error/description strings |
| Static rules | universal **+ v2-strict** on `src/kernel/` and `src/sources/` |

## The tree

```
src/
  kernel/              shared infrastructure (the toolbox)
    db/                ONE PGlite db: client.ts, persistence.ts, data-dir.ts, ddl.ts,
                       schema-registry.ts, provision.ts, relations.ts, schemas/*
    embed/             local embeddings (@huggingface/transformers, multilingual-e5-small)
    http/              the gold-standard HTTP client (getJson + Schema decode + classified retry)
    csv/ zip/ xlsx/ text/   parsing kernels reused across sources
  sources/<x>/         21 vertical slices: catalog.ts + indexer.ts + store.ts
  serve/               the MCP tool layer (declared tools over the low-level SDK Server)
  runtime.ts           ManagedRuntime over AppLayer (21 sources ⊕ Infra)
  index.ts             the CLI (effect/unstable/cli + @effect/platform-bun)
```

The 21 sources: `legislacao`, `ibge-localidades`, `cnae`, `catmat-catser`, `sicaf-fornecedores`,
`sancoes-cgu`, `receita-cnpj`, `tse-eleitoral`, `camara-deputados`, `querido-diario`, `capag`, `pncp`,
`tcu-inidoneos`, `ibge-economia`, `senado`, `cmed-anvisa`, `siconfi-fiscal`, `transferegov`,
`painel-precos`, `transparencia-despesas`, `sinapi`. The last 8 (heavy) are CLI-only: `index <fonte>`.

## Quick commands

```bash
bun install                                   # Bun only — no npm/yarn/pnpm

bun run start                                 # serve over stdio  (= bun src/index.ts, no subcommand)
bun run index                                 # index all LIGHT sources (= bun src/index.ts index)
bun src/index.ts index legislacao             # one source
bun src/index.ts index --include-heavy        # include heavy downloads
bun src/index.ts index pncp --mes 2026-01     # scoped index (pncp month window)
bun src/index.ts index querido-diario --ufs SP,RJ --anos 2024,2025

bun run check                                 # THE GATE — make it green before finishing any change
```

`bun run check` = `typecheck` (`tsc --noEmit`, the type gate — no `dist`, `src` ships as-is)
`+ lint:errors` (the AST checker) `+ test:unit` (`vitest run`). There is **no `bun test`** anymore and
**no CI** — `check` is the only gate; `prepublishOnly` re-runs it. The integration suite is separate
(`bun run test:integration`, `vitest.integration.config.ts`).

**Alchemy owns the local infrastructure.** The user's machine is treated as infra: the dataDir, the
four PGlite extensions, and every table's DDL are provisioned through Effect-native Alchemy resources
in `infra/` (outside the v2-strict tier, but the same Effect idiom — `FileSystem`/`Path`/`Config`, no
node `fs`-sync, no `process.env`). The single source of the schema is `src/kernel/db/schema-registry.ts`
(`dbSources` → `allDbTables` / `tableGroupsBySource` / `schemaDdlText`); `src/kernel/db/provision.ts`
(`provisionSchema`) creates the extensions + every table.

- `bun run infra:deploy` provisions the database (extensions + DDL) via the `Mcp.LocalDatabase`
  resource. Idempotent: a redeploy is a **no-op** while the schema sha256 (`schemaHash()` over
  `schemaDdlText`) is unchanged and the dataDir still exists on disk. `bun run infra:destroy` tears the
  `DadosPublicosLocal` stack down (it does **not** wipe the dataDir).
- `bun run index [<fonte>]` is **Alchemy-backed too**: it deploys `Mcp.LocalIndex` resources
  (`deployIndex`/`deployAll` in `infra/local-index.run.ts`, stack `DadosPublicosIndex`). Each index
  runs `provisionSchema` then the source's index pipeline in the **same** runtime connection, so a
  fresh checkout can `index` directly without a separate `infra:deploy`. A re-index is a no-op unless
  the scope (`scopeHash`) or schema (`schemaHash`) changed.

The runtime never provisions: `serve` only **opens** the already-provisioned dataDir and queries it.

## The static checks (`bun run lint:errors`)

`tooling/static-checks/check-declarative-errors.ts` is **AST-based** (typescript compiler,
`ts.createSourceFile` walk) — not line-based. It dispatches on `ts.SyntaxKind` so it can tell a TS
`as` cast from a SQL `as` alias inside a `sql\`...\`` template. **Two tiers by path:**

**universal** (all of `src/`):
`no-throw` · `no-instanceof` · `no-statement-try-catch-finally` · `no-error-helper-functions`
(`to*Error`/`map*Error`/`wrap*Error`/`*Failure`/`*Fault`, or any function returning an error).

**v2-strict** (`src/kernel/` and `src/sources/` only — `src/serve/` and `src/index.ts` are universal
tier but follow the same idiom by convention):
`no-as-cast` (`as const`/`satisfies` ok) · `no-let-var` · `no-enum` · `no-imperative-while-loop` ·
`no-mutation-accumulator` (`+=`/`++`) · `no-mutable-mapped-type` (`-readonly`) ·
`switch-only-in-get-message` · `error-class-must-use-TaggedErrorClass` ·
`error-code-discrimination` · `no-barrel-passthrough-reexport` ·
`retry-must-classify-errors` · `no-unbounded-concurrency` ·
`no-widened-effect-error-channel` (no `Effect.Effect<_, Error|unknown|any>`) ·
`no-v3-service-api` (no `Context.Tag`/`GenericTag`/`Effect.Tag`/`Effect.Service`) ·
`service-needs-layer`.

To **add a rule**, see the `static-checks-authoring` skill — every rule must be proven
false-positive-clean on the six gold files first.

## The idiom (the gold standard)

**`src/kernel/http/client.ts` is THE reference idiom.** Every file copies its moves:

- **Closed sets**: `Schema.Literals([...])` + `export type X = (typeof X)["Type"]` — never `enum`.
- **Errors**: `class XError extends Schema.TaggedErrorClass<XError>()("XError", { code, ... })` with
  `override get message()` switching on `this.code` and returning pt-BR strings. Built inline at the
  failure site (`Effect.fail(new XError({ code, ... }))`), never via a helper.
- **Config**: `Context.Reference` over a `Schema.Struct` with a `defaultValue` thunk (`DbConfig`,
  `EmbedConfig`) — not a service.
- **Services**: `class Svc extends Context.Service<Svc, Effect.Success<typeof make>>()("...") {}` +
  an exported `Layer.effect(Svc)(make)`. Shape **inferred** from `make`, never hand-written.
- **Branching**: `Match.value/.tag/.when/.orElse`, `Match.type<T>()` — `switch` only in `get message()`.
- **Effects**: pipe combinators (`Effect.flatMap`/`mapError`/`retry`/`catchTag`/`timeout`/`forEach`/
  `acquireRelease`/`tryPromise({ try, catch })`). Errors flow through `Effect.fail` — **never throw**.
- **Boundaries**: HTTP via the kernel (`getJson(url, Schema)` decodes JSON through a Schema so parse
  faults become a typed `http.PARSE`; never `response.json()`/`JSON.parse` raw). Fan-out to gov.br is
  **bounded** (`Effect.forEach(xs, f, { concurrency: 2 })`). Retry is **classified** (the kernel
  http client already does `Effect.retry` over a classified retryable-status set — do not touch it).
  Resources via `Effect.acquireRelease`.
- **Determinism**: any `LIMIT` query needs a total-order tiebreaker (`order by score desc, path`).

**Style**: English identifiers/files/folders; **no code comments, including JSDoc**; pt-BR **only** in
user-facing error/description strings; **no barrel/passthrough re-exports** (import from the source
module); declared data + combinators over imperative glue.

## Storage — ONE PGlite database

There is a single local Postgres-in-process (PGlite) opened once per process in
`src/kernel/db/client.ts`. It runs over a unix socket via `@electric-sql/pglite-socket`, exposed to
Effect as a genuine `@effect/sql-pg` `PgClient`, with Drizzle (`drizzle-orm/effect-postgres`,
`relations` from `db/relations.ts`) on top. `client.ts` loads the four extension **modules** into
PGlite (`PGlite.create({ extensions: { vector, pg_textsearch, ltree, pg_trgm } })`) but no longer runs
any `create extension` / DDL — opening the db is pure. The `create extension` statements are run by
`provisionSchema` (kernel) on behalf of Alchemy / the index path, not on boot. Four extensions:

| extension | role |
|---|---|
| `vector` (pgvector) | dense semantic recall — HNSW `vector_cosine_ops` |
| `pg_textsearch` (`bm25`) | lexical recall — BM25 over Portuguese-analyzed text |
| `ltree` | hierarchical paths (e.g. legislation `art1.par2.inc3`) + GiST index |
| `pg_trgm` | fuzzy/typo-tolerant name matching |

**Persistence**: `DbConfig` is a `Context.Reference<{ dataDir?: string }>`. The dataDir resolution
lives once in `src/kernel/db/data-dir.ts`: `dataDirPath` (pure — `Config` env reads via `Path`, no
`fs`) reads `DADOS_PUBLICOS_MCP_DATA_DIR`, else a platform default (`$XDG_DATA_HOME` or
`$HOME/.local/share` on linux/mac, `LOCALAPPDATA`/`APPDATA`/`%USERPROFILE%\AppData\Local` on win32),
always under `dados-publicos-mcp/`; `ensureDataDir` adds the `makeDirectory(..., { recursive: true })`.
`src/kernel/db/persistence.ts` (`DbPersistenceLive`, provided beneath `DbLayer` in `runtime.ts`) uses
**`dataDirPath` only** — the runtime resolves but never creates the dir (PGlite opens it; Alchemy's
`ensureDataDir` owns the mkdir). This makes indexes **persist across runs**. When `DbConfig` is left at
its default `{}` PGlite opens **ephemeral** (tests use `TestDbLive` = `DbLayer` + `provisionSchema`).

Table schemas live in `src/kernel/db/schemas/<table>.ts` (Drizzle `pgTable` with the BM25 / HNSW /
GiST / trgm indices declared inline). `db/ddl.ts` renders each table's `create table`/`create index`
text (`tableDdlText`) and SQL (`tableDdl`); `db/schema-registry.ts` is the single registry mapping
each source to its tables and deriving `allDbTables`, `tableGroupsBySource` (used by `status_indices`)
and `schemaDdlText` (hashed for the Alchemy diff). **Stores no longer create their own schema** —
provisioning is centralized in `provision.ts` and run by Alchemy / the index path. Rebuilds are
in-place inside a transaction (`delete` + `insert`), never by dropping the database.

## Search — BM25 ⊕ pgvector RRF (⊕ trgm, ⊕ ltree)

The flagship retrieval pattern (see `src/sources/legislacao/store.ts`) is **Reciprocal Rank Fusion**
of two independent candidate lists, fused in one SQL statement:

- a **BM25** list (`order by text <@> to_bm25query(${termo}) limit 50`), and
- a **vector** list (`cosineDistance(embedding, queryEmbedding)` over the HNSW index, `limit 50`),
- joined `full outer join` on the row key, scored `1/(k+rk_bm) + 1/(k+rk_vec)` (`k = 60`),
  `order by score desc, <key>` for determinism.

Embeddings are generated locally by the `Embedder` kernel service (`multilingual-e5-small`, with the
`query:`/`passage:` prefixes the model expects). `pg_trgm` backs fuzzy name lookups
(companies, suppliers, sanctioned parties); `ltree` backs hierarchical navigation and exact
article/section resolution in legislation (`lquery` matches like `root.*.artN`, `@>` for breadcrumbs).

## Adding a Source — the recipe

Use the **`effect-v4-source-authoring`** skill; the worked example is `src/sources/legislacao/`. A
slice is three files plus its table schema(s):

1. **`db/schemas/<table>.ts`** (+ entry in `db/relations.ts` **and** in `db/schema-registry.ts`'s
   `dbSources`): the Drizzle `pgTable`, with BM25 / HNSW / GiST / trgm indices declared inline as
   needed. Registering the table in `schema-registry.ts` is what makes it provisioned, hashed, and
   counted by `status_indices` — there is no separate table list to keep in sync.
2. **`sources/<x>/catalog.ts`**: declared static data (the source's URLs / norms / modalidades /
   error catalog as a `Schema.TaggedErrorClass`) and pure tree/shape builders.
3. **`sources/<x>/indexer.ts`**: fetch via the kernel http client, parse via a kernel
   (`csv`/`zip`/`xlsx`/`text`), map to rows, embed passages. Bounded fan-out, classified retry.
4. **`sources/<x>/store.ts`**: the `Context.Service` (`make` gen function returning the read/index
   methods: `index`, `search`, getters) + exported `Layer.effect`. The store **assumes its tables
   already exist** (it does not create schema); it owns the in-place `replace*` transactions and the
   RRF/trgm/ltree queries.

Then wire it: register the table in `db/schema-registry.ts`, add the `XLive` layer to `AppLayer` in
`runtime.ts`, the service tools in `src/serve/tools/<x>.ts`, register them in `src/serve/registry.ts`,
and add the `FonteKey` literal + `indexRegistry` entry in `src/serve/`. (`status.ts` derives its layout
from the registry — nothing to add there.)

## The serve tool layer

`src/serve/` exposes **85 MCP tools** = **67 query** + **12 index** + **1 `status_indices`** + **5
`guia_*` skills** over the low-level `@modelcontextprotocol/sdk` `Server` (no `registerTool`, no
prompts, no resources, no per-source `status_*` tools, no live-API tools — everything is served from
the local index). The `guia_*` tools (`src/serve/skills.ts`) take no input and return a markdown
composition recipe (local-first + privacy envelope) for the calling agent to ingest before chaining
the primitive tools; `foldExit` renders a string result as raw text instead of JSON.

The pattern:

- **`tool.ts`** — `defineTool({ name, description, input: Schema.Struct, run })` builds a declared
  `Tool` descriptor: it turns the input `Schema` into a JSON Schema via
  `Schema.toJsonSchemaDocument`, and wraps `run` so args are decoded through the `Schema`
  (`Schema.decodeUnknownEffect`) before the handler runs. `AppServices` is the union of all 21 source
  services + `Db` + `Embedder` + `HttpClient` — the env every tool may require.
- **`tools/<source>.ts`** — declared arrays of `defineTool(...)` descriptors. Reusable input checks
  live in `serve/checks.ts` (`NonEmptyString`, `Uf`, `positiveIntMax`, year ranges).
- **`registry.ts`** — concatenates every slice's tool array into the flat `tools` list
  (`queryTools ⊕ indexTools ⊕ statusIndices`).
- **`server.ts`** — the low-level `Server`: `ListToolsRequestSchema` returns the descriptors;
  `CallToolRequestSchema` looks the tool up by name (`Match`), runs `tool.handle(args)` against the
  shared `runtime` (`runtime.runPromiseExit`), and folds the `Exit`.
- **`fold.ts`** — `foldExit`: success → `textContent(JSON.stringify(...))`; failure → `errorContent`
  with the tagged error's pt-BR `message` (or "Parametros invalidos" for a `SchemaError`). Errors are
  data folded into MCP content, never thrown across the SDK boundary.

`status_indices` (`serve/status.ts`) reports a row count per table per source from the local db — it
is the one introspection tool.

## The CLI & runtime

`src/index.ts` is `effect/unstable/cli` (`Command`/`Flag`/`Argument`), run via `BunRuntime.runMain`
with `@effect/platform-bun`'s `BunServices.layer`. The **root command with no subcommand** is `serve()`
(stdio MCP server). The **`index` subcommand** takes an optional `<fonte>` and `--include-heavy`/
`--ufs`/`--anos`/`--mes` flags; it resolves the source via `FonteKey` and **deploys it through
Alchemy** — `deployIndex`/`deployAll` (`infra/local-index.run.ts`) run the programmatic `deploy` from
`alchemy/Deploy` (providing `Cli`/`AlchemyContext`/`State`/`FileSystem`/`Path`) over `Mcp.LocalIndex`
resources. Each `LocalIndex` reconcile runs `provisionSchema` then the source's index effect against
the shared `runtime`, so schema and index land in one persistent connection. An unknown fonte
`Effect.fail`s a tagged error → non-zero exit; all output goes through `Console`.

`src/runtime.ts` is a single `ManagedRuntime` over `AppLayer` = the 21 source `XLive` layers
`provideMerge` `Infra` (`DbLayer` over the persistence layer ⊕ `EmbedderLive` ⊕
`FetchHttpClient.layer`). Both the CLI index path and the serve callbacks resolve services against it.

## Tests

`@effect/vitest` only (no `bun test`, no `__tests__/`). `tests/unit/*.unit.test.ts` and
`tests/integration/*.integration.test.ts`: `it.effect` runs the Effect with a `TestContext`; stub I/O
via injected layers (e.g. `FetchHttpClient.Fetch`); drive retry/timeout with `TestClock`. Because
stores no longer self-provision, tests provide **`TestDbLive`** (`tests/unit/support/test-db.ts` =
`DbLayer` + a one-time `provisionSchema` over **ephemeral** PGlite) wherever they used the raw
`DbLayer`; a single `TestDbLive` reference is memoized across the layer graph, so the same db + one
provisioning is shared. No public network in either runner; bind local servers to `127.0.0.1:0`;
cross-platform temp via `mkdtemp(join(tmpdir(), …))`. The Alchemy resources are covered by
`tests/integration/{local-database,local-index,index-bundle}.integration.test.ts` via the
`alchemy/Test/Vitest` harness.

## Pointers

Architecture decisions: `docs/adr/0001-effect-pglite.md`,
`docs/adr/0002-declarative-architecture-and-folders.md` (note: the linter requires
`Schema.TaggedErrorClass`, which supersedes those ADRs' `Data.TaggedError` wording). Domain
vocabulary: `CONTEXT.md`. Roadmap: `docs/ROADMAP_V2.md`. Skills: `effect-v4-source-authoring`,
`static-checks-authoring`. **AGPL-3.0-only** — published artifacts are `src/` + `README.md` + `LICENSE`.
