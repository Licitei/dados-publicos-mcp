# 0002 — Declarative architecture and folder layout

The v2 is **declarative-first**: declare data/schema and compose with Effect combinators (`Match`, `Layer`, `Schema`), never hand-written glue functions. Code is **English** (identifiers, files, folders); only user-facing error strings are pt-BR. **No code comments** (including JSDoc). The physical layout follows **folder = capability = seam**: each folder exposes a minimal public surface and hides the rest.

## Declarative, not helpers

The lint (`dados-publicos/no-error-helper-functions`, strict tier on `src/kernel/` and `src/sources/`) bans `to*Error`/`is*Error`/`map*Error`/`wrap*Error`/`from*Error` and functions that return an error. We extend the aesthetic to all code:

- Branch with **`Match`**; `switch` only inside a `get message()`.
- Tools declared as **data** `{ name, schema, handler }`, folded by one deep `defineTool` — never a per-source `registerXxxTools` with `if/else`.
- Errors as **`Schema.TaggedErrorClass`** (`Schema.Literals` code + `get message()` switch, built inline at the failure site); composition as **`Layer.mergeAll`** / **`Layer.provideMerge`**.
- Services as **`Context.Service`** + exported **`Layer.effect`**; shape via `Effect.Success<typeof make>`; config via `Context.Reference`.
- No `as` casts, no `let`/`var`, no `enum`, no `while`, no statement `try/catch`, no barrels. Bounded fan-out (`concurrency: 2`); classified retry; JSON decoded through a `Schema`.
- Rule of thumb: **one deep declarative module (DSL/kernel) > many small helpers.**

## Anti-`utils` rule

No `utils/`, `helpers/`, `misc/`, `common/`. A folder earns its name by being a deep module with an interface. If the candidate name is "util", the content is: (a) a **capability** → name it (`text`, `csv`, `http`, `duck`); (b) a **domain** concept → name it (`cnpj`, `search`); or (c) it **should not exist** → inline it as a combinator.

## Layout (as built)

```
src/
  index.ts          CLI entrypoint (effect/cli + @effect/platform-bun)
  runtime.ts        ManagedRuntime over AppLayer = 20 source XLive provideMerge Infra
  kernel/           deep core, by capability
    duck/           Duck: one native DuckDB file, DuckTable declarations, bm25
    search/         Search (fff over the Markdown corpora), Fuzzy (fff typo fallback), CorpusGit
    http/           Http (gold standard)
    text/ csv/ xlsx/ zip/   data-dir.ts
  sources/<source>/ catalog.ts (Schemas, codes, errors, DuckTables) · indexer.ts (download/parse) · store.ts (Context.Service + XLive)
  serve/            MCP tool layer over the low-level @modelcontextprotocol/sdk Server
    tool.ts fold.ts server.ts status.ts lazy.ts registry.ts index-registry.ts skills.ts tools/<source>.ts
```

Tests live in `tests/unit` and `tests/integration` (vitest + @effect/vitest). The layout and import directions are
enforced by the lint (`tooling/lint`: konsistent + `no-restricted-imports` per directory), not by this document.

## Fixed naming

`catalog.ts` · `indexer.ts` · `store.ts` · **kebab-case always** (lint: `dados-publicos/filename-case`).

## Status

**accepted — realized.** The folder migration is done: `src/modules/**` and `src/core/**` are deleted; the live tree is `src/kernel/**`, `src/sources/**`, `src/serve/**`. Tools are folded from data via `defineTool`; there is no `registerTool`/`IndexAdapter`/legacy registry. Tests are `vitest` under `tests/` — no `bun test`.
