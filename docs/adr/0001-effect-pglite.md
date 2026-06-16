# 0001 — Effect v4 + PGlite + Drizzle as the v2 foundation

The v2 swapped, at once, the data layer (SQLite → **PGlite** + **Drizzle**) and the effect/error model (`better-result`+`evlog` → **Effect v4**). Effect is not a "+1 lib": it is errors-as-values itself (`Effect<A, E, R>`), and it absorbs the kysely-vs-Drizzle decision via `@effect/sql-pg` + `drizzle-orm/effect-postgres`. The old evlog errors became `Schema.TaggedErrorClass` with a stable, typed code; user-facing message strings stay pt-BR.

## Considered Options

- **kysely (baseline WIP)** — kept only as a SQL compiler; rejected: Drizzle over the Effect SQL client is the blessed v4 path.
- **v3 stable now, v4 later** — rejected: avoids a double migration; we accept the beta.

## Status

**accepted — realized.** The cutover is complete: the whole live tree is Effect v4 native, all legacy is deleted. Effect v4 is still in **beta** (`effect@4.0.0-beta.81`); the risk posture holds — version pinned without `^`, lockfile committed, beta bumps deliberate and changelog-read. `HttpClient` lives in `effect/unstable/http`; the CLI lives in `effect/unstable/cli` (v4 unified the old `@effect/platform` packages).

## How it landed

- **One** local PGlite database, opened as a `Layer` (`src/kernel/db/client.ts`) with a `Scope`-managed lifecycle — no global `getDb` cache, no `closeAllDbs`. PGlite is served to `@effect/sql-pg`'s `PgClient` over a unix socket (`pglite-socket`), so it is a genuine Postgres client; Drizzle (`drizzle-orm/effect-postgres`) is the query builder on top.
- Four extensions are enabled on open: **`vector`** (pgvector), **`pg_textsearch`** (BM25), **`ltree`**, **`pg_trgm`**. Hybrid retrieval is BM25 ⊕ pgvector fused by RRF, with `pg_trgm` fuzzy matching and `ltree` hierarchies (CNAE / CATMAT-CATSER / legislation tree).
- Errors are `Schema.TaggedErrorClass` with a `Schema.Literals` code and a `get message()` switch (pt-BR), built inline at the failure site.
- `bun:sqlite`, `better-result`, `evlog`, `zod`, `dayjs`, `kysely` are gone. Per-fonte JSON / SQLite / FTS5 indexes are gone — replaced by the single PGlite database.
- The database location is resolved from `DADOS_PUBLICOS_MCP_DATA_DIR` via `Config` (XDG / platform default fallback), so indexes **persist across runs** (`src/kernel/db/persistence.ts`, wired beneath `DbLayer` in `runtime.ts`).
- See `docs/ROADMAP_V2.md` for the (now mostly complete) roadmap and the remaining optional follow-ups.
