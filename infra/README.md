# infra/ — Effect-native Alchemy

Declarative local bootstrap for the MCP server, using
[`alchemy`](https://alchemy.run) **2.x (Effect-native)** — resources are Effect
programs, not promise callbacks.

The MCP runs on the user's own machine, so the "infra" is the local PGlite
database: its data directory, the four extensions (`vector`, `pg_textsearch`,
`ltree`, `pg_trgm`) and the table DDL. `infra/` turns provisioning that into one
idempotent, stateful command instead of relying on each source store to lazily
create its tables on first index.

## Why it lives outside `src/`

`src/kernel/**` and `src/sources/**` are under the v2-strict static checks (no
`throw`, no `try/catch`, no `as`, no `let`). Alchemy resource authoring needs the
imperative escape hatches (`Effect.tryPromise` `catch`, node `fs`), so the
integration sits in `infra/` — the universal tier — and only crosses into `src/`
through clean imports (`DbLayer`, `DbConfig`, `tableDdl`, the schema tables).

## Files

| file | role |
|---|---|
| `tables.ts` | the full table set (mirrors `kernel/db/relations.ts`) |
| `local-database.ts` | `Mcp.LocalDatabase` custom Resource + its Provider — opens PGlite at the dataDir, enables extensions, runs every table's DDL; redeploy is a no-op while the schema hash is unchanged |
| `local-index.ts` | `Mcp.LocalIndex` custom Resource + its Provider — runs one source's index pipeline. **Registry + runner are injected** (`LocalIndexConfig`) so it is testable offline; it must never import `src/runtime` |
| `local-index.run.ts` | production wiring — binds the real `indexRegistry` + `src/runtime` `runtime` and the combined `Provider.collection([LocalDatabase, LocalIndex])`. **Bun-only** (pulls `@effect/platform-bun` via `src/runtime`); keep it out of any vitest import |
| `alchemy.run.ts` | the Stack entrypoint (`Alchemy.Stack` + `localState`) — deploys `LocalDatabase` + `LocalIndex` |

## Commands

```bash
bun run infra:deploy     # provision the local database (extensions + DDL)
bun run infra:destroy    # tear the stack down (does NOT wipe the dataDir)
```

State is persisted to `.alchemy/` next to the project. The resource resolves the
dataDir exactly like `kernel/db/persistence.ts` (`DADOS_PUBLICOS_MCP_DATA_DIR`,
else `$XDG_DATA_HOME`/`~/.local/share/dados-publicos-mcp`); pass `{ dataDir }` to
the resource to override.

The deploy is covered by `tests/integration/local-database.integration.test.ts`
via the `alchemy/Test/Vitest` harness (create → assert → destroy).
