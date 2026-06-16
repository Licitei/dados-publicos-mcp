# CLAUDE.md

Read **AGENTS.md** for the full picture. This file is the load-bearing subset.

## One world: v2 Effect-native

The v1→v2 cutover is **done**. There is no migration, no legacy layer, no two worlds. Everything
live is Effect-native:

- **`src/kernel/**`** — Effect v4 (`4.0.0-beta.81`) + PGlite + Drizzle. One local Postgres with four
  extensions: `vector` (pgvector), `pg_textsearch` (BM25), `ltree`, `pg_trgm`.
- **`src/sources/**`** — 12 source slices, each a `Context.Service` store + an `XLive` Layer.
- **`src/serve/**`** — the MCP tool layer over the low-level `@modelcontextprotocol/sdk` Server
  (`tool.ts`/`fold.ts`/`server.ts`/`status.ts`/`registry.ts`/`index-registry.ts`/`tools/<source>.ts`).
- **`src/runtime.ts`** — `ManagedRuntime` over `AppLayer` (12 `XLive` `provideMerge` `Infra`).
- **`src/index.ts`** — CLI via `effect/unstable/cli` + `@effect/platform-bun` (`BunRuntime.runMain`).

`serve` (the default, no-subcommand action) wires the real `src/sources` slices — 58 MCP tools
(44 query + 8 `indexar_*` + `status_indices` + 5 `guia_*` skills that return composition recipes for
the agent to ingest). The `index` subcommand recria os índices locais.
`DADOS_PUBLICOS_MCP_DATA_DIR` (via `Config`, resolved in `src/kernel/db/persistence.ts`) points
PGlite at a persistent path so índices sobrevivem entre execuções; unset → platform default under
`$XDG_DATA_HOME`/`$HOME/.local/share`.

## Storage + search

One PGlite database at the dataDir. Search is hybrid: BM25 (`pg_textsearch`) ⊕ pgvector cosine
fused by RRF, with `pg_trgm` for fuzzy name matching and `ltree` for hierarchical (PageIndex) trees.
No per-fonte JSON/SQLite/FTS5 — that's gone. There is no live-API / "online real-time" layer:
índices are built locally, then queried locally.

## The gate

`bun run check` (`tsc --noEmit` + `lint:errors` + `vitest run`) — the only gate, no CI. Make it
green before finishing any change. No `bun test`.

`lint:errors` is an **AST** linter (`tooling/static-checks/check-declarative-errors.ts`), two tiers;
the **strict** tier applies only to `src/kernel/` and `src/sources/`. Every rule must be
false-positive-clean on the six gold files.

## v2-strict invariants (in `src/kernel`/`src/sources`)

- Gold standard = `src/kernel/http/client.ts`. Copy its idiom.
- `Schema.Literals` codes; `Schema.TaggedErrorClass` with `get message()` switch (pt-BR); error built
  inline at the failure site (no helper). `Context.Service` + exported `Layer.effect`; shape via
  `Effect.Success<typeof make>`; config via `Context.Reference`.
- `Match` for branching; `switch` only in `get message()`. Errors via `Effect.fail` — never `throw`.
- No `as` casts, no `let`/`var`, no `enum`, no `while`, no statement `try/catch`, no comments, no
  barrels. Bounded fan-out (`concurrency: 2`); classified retry; JSON decoded through a Schema.
- Adding a Source → use the `effect-v4-source-authoring` skill.

## Style

- English code/files/comments — but **no code comments at all**, including JSDoc.
- pt-BR **only** inside user-facing error message strings.
- Declarative: declared data + combinators (`Match`/`Layer`/`Schema`) over glue functions.
- Commit or push **only when asked**.
