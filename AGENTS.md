# AGENTS.md — dados-publicos-mcp

MCP server (AGPL-3.0, **Bun + TypeScript**) that indexes Brazilian public-procurement
legislation and related public data **locally** (SQLite/JSON) and serves it to MCP clients
over stdio. Each data source is a self-contained vertical-slice module plugged into a core
adapter registry. Errors are values (`better-result` + `evlog` catalogs); I/O is bun-native.

## Quick commands

```bash
bun install                       # Bun only — no npm/yarn/pnpm

bun run start                     # serve over stdio   (= bun src/index.ts serve)
bun run index                     # build all LIGHT indices (requiresHeavyDownload=false)
bun src/index.ts index legislacao            # one source
bun src/index.ts index --include-heavy       # include heavy downloads
bun src/index.ts index receita-cnpj --include-heavy --ufs SP,RJ --anos 2024,2025 --mes 2026-01

bun run check                     # THE GATE: typecheck + lint:errors + test
```

**Run `bun run check` and make all three green before finishing any change.** It is the only
gate — there is no CI. `prepublishOnly` re-runs it.

## Static checks (must pass)

| Command | Runs | Enforces |
|---|---|---|
| `bun run typecheck` | `tsc --noEmit` | strict mode; no implicit any / strict null |
| `bun run lint:errors` | `bun tooling/static-checks/check-declarative-errors.ts` | the declarative-error + no-`try`/`catch` rules below; exits 1 on any hit |
| `bun test` + `vitest run` | `bun:test` (`*.test.ts`) and `@effect/vitest` (`*.vitest.ts`) | tests never hit the public network |

`lint:errors` scans `src/` only (skips `__tests__/`). It is **line-based** and **forbids**:

- `instanceof`, `throw new Error`, `HTTPError`/`TimeoutError`, `isHTTPError`/`isTimeoutError`.
- **statement-level `try {` / `catch (` / `catch {` / `finally`** — exception handling and
  resource `try/finally` are banned. (The object-key form `Result.try({ try, catch })` and the
  inline `catch:` handler are fine — they are not statements.)
- **error wrapper/helper functions**: `toXError` / `isXError` / `mapError` / `wrapError` /
  `fromError`, `*Failure` / `*Fault`, `const xError = (...)`, or any function whose return type
  *is* `EvlogError`. Build the error inline at the decision point instead.

## Architecture

Core defines one adapter contract; every source implements it and registers in
`src/core/registry.ts`. The CLI/`serve()` iterate the registry. Each source is a vertical slice:
`tools` (MCP) → `service` (read queries) → `indexer` (build) → `store` (SQLite/schema) →
`errors` (evlog catalog).

```
src/
  index.ts                CLI (serve | index [fonte]); registerXxxTools() in serve();
                          process.on("exit", closeAllDbs) — the ONLY db close.
  core/
    adapter.ts            IndexAdapter contract: key, titulo, storage, requiresHeavyDownload, build(), status()
    registry.ts           adapters[] + getAdapter(key) / listAdapters()
    status.ts             registerStatusTool() — aggregate status of all indices
    dataDir.ts            getDataDir() / dominioDir(key) / dominioPath(key, file) — cross-platform
    normalize.ts          normalize(), onlyDigits(), normalizeCnpj()
    store/
      sqlite-store.ts     DB SINGLETON: getDb / openDb / openReadonly / closeAllDbs; batchInsert, countRows, dbExists
      json-store.ts       createJsonStore<T>() — Bun.file/Bun.write, zod-validated, cached
    http/download.ts      fetchWithRetry() / fetchJson<T>() / downloadToFile() — all return Result; Bun.write
    parse/                csv.ts, numero-br.ts, data-br.ts, zip.ts (Bun.inflateSync) — no external deps
  modules/<source>/
    tools.ts              registerXxxTools(server) + zod input schemas + Result.serialize() responses
    service.ts            read queries → Result<T, EvlogError> (never throw)
    indexer.ts            xxxIndexAdapter: build() (download→parse→persist) + status()
    store.ts              DOMINIO/DB_FILE, getIndexPath(), indiceExiste(), createSchema (CREATE … IF NOT EXISTS)
    errors.ts             defineErrorCatalog('domain', {...}) + the evlog module augmentation
    catalog.ts            static domain constants/types (optional)
  mcp/                    reserved, currently EMPTY — MCP wiring lives in modules/*/tools.ts
```

`adapter.key` MUST equal the data-dir folder name. `BuildSummary` carries `dominio`, `registros`,
`atualizadoEm` (ISO-8601), `caminho`; `StatusInfo` adds `existe`/`storage`/`requiresHeavyDownload`.

## Error handling (hard rules)

All failures are values: `Result<T, EvlogError>` from `better-result`, errors from per-module
`evlog` catalogs. Functions **return** errors — they never `throw`, never `try/catch`.

**Required pattern** — build the catalog error inline, at the decision point:

```ts
// guard at a decision point
if (!indiceExiste()) {
  return Result.err(legislacaoErrors.INDICE_AUSENTE());
}

// wrap throwing I/O with an inline `catch:` handler (the ONLY place errors are built)
return Result.tryPromise({
  try: async () => JSON.parse(await response.text()),
  catch: (cause): EvlogError =>
    httpErrors.PARSE({ url, internal: { cause: String(cause) } }),
});

// compose Results with a single guard, or Result.gen + yield* / Result.await
const fetched = await fetchWithRetry(url);
if (Result.isError(fetched)) return Result.err(domainErrors.DOWNLOAD({ url, internal: { cause: fetched.error.message } }));
const response = fetched.value;
```

- One `defineErrorCatalog('<domain>', {...})` per module in `errors.ts`, keys `SCREAMING_SNAKE_CASE`,
  each with `status`, `message` (string or factory), `why`/`fix`, `tags`; add the
  `declare module 'evlog'` augmentation. Codes are auto-prefixed `domain.CODE`.
- **No error helper/wrapper functions** (`toXError`, `isXError`, `mapError`…), no function returning
  `EvlogError`. Build it inline in a `catch:` handler. Discard-and-fallback uses
  `Result.try(...).unwrapOr(fallback)`, not `try/catch`.
- `panic(msg)` ONLY for impossible state / invariants (a thrown defect) — never for user input.
- pt-BR for all `message`/`why`/`fix`.

## better-result idioms (use these, declaratively)

- Create: `Result.ok(v)` / `Result.err(e)`. Wrap I/O: `Result.try({try,catch})` (sync),
  `Result.tryPromise({try,catch}, { retry })` (async).
- Compose: a single `if (Result.isError(x)) return …` guard, or
  `Result.gen(async function* () { const v = yield* Result.await(p); … return Result.ok(v); })`.
- Inspect/transform: `Result.isOk/isError`, `.map`, `.mapError`, `.unwrapOr(fallback)`,
  `.match({ok,err})`. Batch: `Result.partition`. RPC: `Result.serialize` (tools return this).
- There is **no resource/bracket/`using` API** — resource lifetime is the **DB singleton**, not `try/finally`.

## Databases — singleton only

- Open via `getDb(absPath,{readonly?})` / `openDb(dominio,file)` (rw) / `openReadonly(dominio,file)`
  from `core/store/sqlite-store.ts`. Each `(path, mode)` is opened **once per process** and reused.
- **Never** `new Database(...)` in a module. **Never** call `db.close()` — the process-exit hook
  (`closeAllDbs`) owns lifetime. Reads use `openReadonly` (won't create; guard with `dbExists`/
  `INDICE_AUSENTE` first); builds use `openDb`. Rebuilds are in-place (`DELETE FROM` / `CREATE … IF
  NOT EXISTS`) — no module deletes its `.db` file (the invariant that makes the singleton safe).

## 100% bun-native I/O

- Files: `Bun.file(p).exists()` / `.text()` / `.json()` / `.bytes()` / `.stat()`, `.size` (sync,
  `> 0` = exists), `.delete()`; write/download with `Bun.write(dest, data | Response)`.
- Compression: `Bun.inflateSync` / `Bun.deflateSync` / `Bun.gunzipSync`.
- **Blessed node retains** (no bun equivalent — keep these): `node:path` (`join`/`dirname`),
  `node:os` `homedir`, `node:fs` `mkdirSync`, `node:fs/promises` `mkdir`, `node:zlib` `crc32`,
  and test-only `mkdtemp`/`tmpdir`. Everything else uses `Bun.*`.

## Adding a new data source

1. `src/modules/<x>/` with: `errors.ts`, `store.ts`, `service.ts`, `indexer.ts`, `tools.ts`
   (+ `catalog.ts` if static data).
2. `errors.ts`: `defineErrorCatalog('<x>', {...})` + the `declare module 'evlog'` augmentation.
3. `store.ts`: `DOMINIO`/`DB_FILE`, `getIndexPath()` (= `dominioPath(DOMINIO, DB_FILE)`),
   `indiceExiste()` (`dbExists`), idempotent `createSchema(db)`.
4. `indexer.ts`: export one `<x>IndexAdapter` — `build()` (download via `core/http`, parse via
   `core/parse`, persist via `openDb` + `batchInsert`) and `status()` (`dbExists` + `countRows` +
   `Bun.file(path).stat()` mtime). No `db.close()`, no `try/finally`.
5. `service.ts`: read queries returning `Result<T, EvlogError>`, opening via `openReadonly` after a
   `dbExists` guard.
6. `tools.ts`: `register<X>Tools(server)` (zod schemas, `Result.serialize()` responses).
7. Register in `src/core/registry.ts` **and** call `register<X>Tools(server)` in `serve()`.
8. Add `__tests__/<x>.test.ts`.

## Tests

- Two runners: **`bun:test`** for Bun-native tests (`__tests__/<domain>.test.ts`, default) and
  **`@effect/vitest`** for Effect-heavy code (`__tests__/<domain>.vitest.ts`). `bun test` matches
  `*.test.ts`; `vitest run` matches `*.vitest.ts` — they never overlap.
- `bun:test` (`import { test, expect, describe } from "bun:test"`): Bun APIs, `bun:sqlite`, local
  `Bun.serve({ hostname: "127.0.0.1", port: 0 })`.
- `@effect/vitest` (`import { describe, expect, it } from "@effect/vitest"`): `it.effect` runs the
  Effect with a `TestContext`; stub I/O (e.g. inject `FetchHttpClient.Fetch`) instead of real
  servers; drive retry/timeout deterministically with `TestClock.adjust` + `Effect.forkChild`.
  Runs under Node — no Bun APIs in these files.
- **No public network** in either runner; **cross-platform** temp paths via
  `mkdtemp(join(tmpdir(), "…"))`; bind servers to `127.0.0.1:0`.
- Run: `bun run check` (typecheck + lint + `bun test` + `vitest run`), or each runner directly.

## Conventions & gotchas

- **TS strict + ESM**, Bun-only (`bun@1.3.9`, engines `>=1.1.0`); deps via `bun add`/`bun remove`.
- **pt-BR domain language**: identifiers (`buscarLegislacao`, `dominio`, `registros`) and all
  user-facing/error text are Portuguese — match it.
- Generated indices are **never committed**: `*.db`, `*.db-{shm,wal}`, `.cache/` are gitignored;
  they live under `getDataDir()` (`~/.local/share/dados-publicos-mcp/`, Windows `%APPDATA%`,
  override `DADOS_PUBLICOS_MCP_DATA_DIR`).
- **AGPL-3.0-only**. Published artifacts: `src/` + `README.md` + `LICENSE` (`package.json#files`).
- `serve` is the default command (`bun src/index.ts` serves; it does not index). `src/mcp/` is empty.
- `Result.try` does NOT catch async — use `Result.tryPromise` for `await` work.
- The linter is line-based: never put `try {` / `catch (` / `finally` in a comment, or it trips.
