# 0002 — Declarative architecture and folder layout

The v2 is **declarative-first**: declare data/schema and compose with Effect combinators (`Match`, `Layer`, `Schema`), never hand-written glue functions. Code is **English** (identifiers, files, folders); only user-facing error strings are pt-BR. **No code comments** (including JSDoc). The physical layout follows **folder = capability = seam**: each folder exposes a minimal public surface and hides the rest.

## Declarative, not helpers

`lint:errors` (an AST checker, strict tier on `src/kernel/` and `src/sources/`) bans `to*Error`/`is*Error`/`map*Error`/`wrap*Error`/`from*Error` and functions that return an error. We extend the aesthetic to all code:

- Branch with **`Match`**; `switch` only inside a `get message()`.
- Tools declared as **data** `{ name, schema, handler }`, folded by one deep `defineTool` — never a per-source `registerXxxTools` with `if/else`.
- Errors as **`Schema.TaggedErrorClass`** (`Schema.Literals` code + `get message()` switch, built inline at the failure site); composition as **`Layer.mergeAll`** / **`Layer.provideMerge`**.
- Services as **`Context.Service`** + exported **`Layer.effect`**; shape via `Effect.Success<typeof make>`; config via `Context.Reference`.
- No `as` casts, no `let`/`var`, no `enum`, no `while`, no statement `try/catch`, no barrels. Bounded fan-out (`concurrency: 2`); classified retry; JSON decoded through a `Schema`.
- Rule of thumb: **one deep declarative module (DSL/kernel) > many small helpers.**

## Anti-`utils` rule

No `utils/`, `helpers/`, `misc/`, `common/`. A folder earns its name by being a deep module with an interface. If the candidate name is "util", the content is: (a) a **capability** → name it (`text`, `csv`, `http`, `embed`); (b) a **domain** concept → name it (`cnpj`, `db`); or (c) it **should not exist** → inline it as a combinator.

## Layout (as built)

```
src/
  index.ts                          # CLI entrypoint (effect/unstable/cli + @effect/platform-bun)
  runtime.ts                        # ManagedRuntime over AppLayer = 12 source XLive provideMerge Infra
  kernel/                           # deep core, by capability
    db/    (client.ts PGlite Layer + 4 extensions, persistence.ts Config dataDir, ddl.ts, relations.ts, schemas/<table>.ts)
    embed/ (embedder.ts, dimensions.ts)
    http/  (client.ts — gold standard)
    text/  · csv/ · xlsx/ · zip/
  sources/<source>/                 # 12 slices, each a Context.Service + XLive Layer
    store.ts query.ts indexer.ts errors.ts data.ts <source>.test.ts
  serve/                            # MCP tool layer (Effect-native over @modelcontextprotocol/sdk Server)
    tool.ts fold.ts server.ts status.ts registry.ts index-registry.ts tools/<source>.ts
```

The 12 sources: `legislacao`, `ibge-localidades`, `cnae`, `catmat-catser`, `sicaf-fornecedores`, `sancoes-cgu`, `receita-cnpj`, `tse-eleitoral`, `camara-deputados`, `querido-diario`, `capag`, `pncp`. All persist into the **one** PGlite database under `src/kernel/db/schemas/`.

## Fixed naming

`store.ts` (not `db`) · `query.ts` (not `service`) · `indexer.ts` · `errors.ts` · `data.ts` (not `catalog`) · **kebab-case always**.

## Status

**accepted — realized.** The folder migration is done: `src/modules/**` and `src/core/**` are deleted; the live tree is `src/kernel/**`, `src/sources/**`, `src/serve/**`. Tools are folded from data via `defineTool`; there is no `registerTool`/`IndexAdapter`/legacy registry. Tests are `vitest` (`*.test.ts` colocated in the slice) — no `bun test`, no `__tests__/`.
