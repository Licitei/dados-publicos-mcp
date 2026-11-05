# infra/ — Alchemy (Effect-native)

The MCP runs on the user's machine, so the machine is the infrastructure. Every local index — a DuckDB source or a
git-cloned corpus — is an `Mcp.LocalIndex` resource, and Alchemy decides when it must be rebuilt.

| file | role |
|---|---|
| `local-index.ts` | `Mcp.LocalIndex` Resource + Provider. Registry and runner are injected (`LocalIndexConfig`) so it is testable offline. Attributes: `rows`, `scopeHash`, `schemaHash` (hash of the source's declared `DuckTable`s), `version` (remote version, e.g. git HEAD), `indexedAt`. `diff` re-indexes when scope, tables or version change; a source without a version re-indexes on every explicit run. |
| `local-index.run.ts` | Production wiring: the real `indexRegistry` + `src/runtime`, and `deployIndex`/`deployAll` used by the CLI `index` command (stack `DadosPublicosIndex`). |
| `alchemy.run.ts` | `infra:deploy` entrypoint — stack `DadosPublicosLocal` with one `LocalIndex` per light source. |
| `schema-hash.ts` | `tablesText`/`tablesHash` over `DuckTable` declarations, `sha256Hex`. |
| `providers.ts` | the `Mcp` provider collection tag. |

```bash
bun run infra:deploy     # index every light source (no-op when nothing changed)
bun run infra:destroy    # drop the stack state (does not delete the data dir)
bun run index <fonte>    # one source through the same resource
```

State lives in `.alchemy/`. Covered by `tests/integration/local-index.integration.test.ts`
(`@alchemy.run/test/Vitest`: create → assert → plan no-op → destroy).
