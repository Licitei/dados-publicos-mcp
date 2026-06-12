# 0001 — Effect v4 + PGlite + Drizzle as the v2 foundation

The v2 swaps, at once, the data layer (SQLite → **PGlite** + **Drizzle** + `drizzle-zod`) and the effect/error model (`better-result`+`evlog` → **Effect v4**). Effect is not a "+1 lib": it is errors-as-values itself (`Effect<A, E, R>`), and it absorbs the kysely-vs-Drizzle decision via `@effect/sql-pglite` + `@effect/sql-drizzle`. evlog errors become `Data.TaggedError` with a stable code; user-facing message strings stay pt-BR.

## Considered Options

- **kysely (baseline WIP)** — kept only as a SQL compiler; rejected: `@effect/sql-drizzle` is the blessed v4 path.
- **v3 stable now, v4 later** — rejected: avoids a double migration; we accept the beta.

## Status

accepted — Effect v4 is in **beta** (`effect@4.0.0-beta.x`). Risk accepted: version pinned without `^`, lockfile committed, beta bumps deliberate and changelog-read. HttpClient lives in `effect/unstable/http` (v4 unified the `@effect/platform` packages).

## Consequences

- `bun:sqlite` and `better-result` leave at the end of the migration (module by module).
- The DB becomes a `Layer` with a `Scope`-managed lifecycle; no more global `getDb` cache + `closeAllDbs`.
- See the roadmap in `docs/ROADMAP_V2.md`.
