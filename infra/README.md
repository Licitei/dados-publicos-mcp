# infra/ — Effect-native Alchemy

Declarative local bootstrap for the MCP server, using
[`alchemy`](https://alchemy.run) **2.x (Effect-native)** — resources are Effect
programs, not promise callbacks.

The MCP runs on the user's own machine, so **the user's machine is the
infrastructure**: the local PGlite database — its data directory, the four
extensions (`vector`, `pg_textsearch`, `ltree`, `pg_trgm`) and the table DDL — is
provisioned here, not lazily by each source store on first index. Alchemy owns
that state; the runtime only opens and queries what was provisioned.

## Effect-native, same idiom as `src/`

`infra/` is **not** an imperative escape hatch. It follows the same Effect idiom
as the runtime: filesystem via `effect/FileSystem`, paths via `effect/Path`, env
via `effect/Config`, failures as typed values — no `node:fs`-sync, no
`process.env`, no `throw`/`as`. It lives outside `src/` only because it is the
IaC layer (Alchemy custom Resources), while `src/kernel/**` and `src/sources/**`
are the v2-strict application code. It crosses into `src/` through clean imports
only: the schema registry (`db/schema-registry.ts`), the provisioner
(`db/provision.ts`), the dataDir resolver (`db/data-dir.ts`), `DbLayer`/`DbConfig`,
and — for the index path — `src/runtime`.

The schema is defined **once** in `src/kernel/db/schema-registry.ts` (`dbSources`
→ `allDbTables` / `tableGroupsBySource` / `schemaDdlText`). There is no separate
table list in `infra/` to keep in sync (the old `infra/tables.ts` is gone).

## Files

| file | role |
|---|---|
| `local-database.ts` | `Mcp.LocalDatabase` Resource + Provider — resolves the dataDir (`ensureDataDir`), opens PGlite, runs `provisionSchema` (extensions + every table). Redeploy is a no-op while `schemaHash()` (sha256 of `schemaDdlText`) is unchanged and the dataDir still exists (`diff` via `FileSystem.exists`). `schemaDdl`/`schemaHash` are derived from the kernel registry — no Drizzle-internals casts |
| `local-index.ts` | `Mcp.LocalIndex` Resource + Provider — runs one source's index pipeline. **Registry + runner are injected** (`LocalIndexConfig`) so it is testable offline; it must never import `src/runtime`. Attributes carry `scopeHash` + `schemaHash`; `diff` re-indexes only when the scope or schema changed |
| `local-index.run.ts` | production wiring — binds the real `indexRegistry` + `src/runtime`. `defaultConfig.run` runs `provisionSchema` **then** the source's index in the same runtime connection. Exposes the Effect-native `deployIndex` / `deployAll` (programmatic `deploy` from `alchemy/Deploy`, stack `DadosPublicosIndex`) used by the CLI. **Bun-only** (pulls `@effect/platform-bun` via `src/runtime`); keep it out of any vitest import |
| `index-bundle.ts` | `Mcp.IndexBundle` Resource + Provider — snapshots the PGlite dataDir to a `dest` dir for distributing prebuilt indexes. Always-update `diff`; `delete` removes `dest`. Standalone (`McpBundle` collection), opt-in. **Keep `dest` distinct from the live dataDir** |
| `alchemy.run.ts` | the `infra:deploy` entrypoint — Stack `DadosPublicosLocal`, deploys `Mcp.LocalDatabase` only (provision the DB; indexing is a separate, Alchemy-backed `index` command) |
| `providers.ts` | the `Mcp` provider collection tag |

## Commands

```bash
bun run infra:deploy     # provision the local database (extensions + DDL)
bun run infra:destroy    # tear the DadosPublicosLocal stack down (does NOT wipe the dataDir)
bun run index <fonte>    # Alchemy-backed index: provision + index in one connection
```

State is persisted to `.alchemy/` next to the project. The two stacks
(`DadosPublicosLocal` for the DB, `DadosPublicosIndex` for indices) keep separate
state so they don't churn each other. The dataDir resolves exactly like the
runtime (`DADOS_PUBLICOS_MCP_DATA_DIR`, else `$XDG_DATA_HOME`/`~/.local/share/dados-publicos-mcp`);
pass `{ dataDir }` to `LocalDatabase` to override.

The deploy is covered by `tests/integration/{local-database,local-index,index-bundle}.integration.test.ts`
via the `alchemy/Test/Vitest` harness (create → assert → destroy).
