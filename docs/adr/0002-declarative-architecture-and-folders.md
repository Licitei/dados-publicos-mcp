# 0002 — Declarative architecture and folder layout

The v2 is **declarative-first**: declare data/schema and compose with Effect combinators (`Match`, `Layer`, `Schema`, `Effect.catchTags`), never hand-written glue functions. Code is **English** (identifiers, files, folders); only user-facing error strings are pt-BR. **No code comments.** The physical layout follows **folder = module = seam**: each folder exposes a minimal public surface (one `index.ts` with its `Layer`) and hides the rest.

## Declarative, not helpers

`lint:errors` already bans `to*Error`/`is*Error`/`map*Error`/`wrap*Error`/`from*Error` and functions that return an error. We extend the aesthetic to all code:

- Branch/map with **`Match.tag(...)`** / **`Effect.catchTags({...})`**, not a `switch` inside a `to*` helper.
- Tools declared as a **record** `{ name: { schema, handler } }`, consumed by one deep `defineTool` — not a per-source `registerXxxTools` with `if/else`.
- Errors as **`Data.TaggedError`**; composition as **`Layer.mergeAll`**.
- Rule of thumb: **one deep declarative module (DSL/kernel) > many small helpers.**

## Anti-`utils` rule

No `utils/`, `helpers/`, `misc/`, `common/`. A folder earns its name by being a deep module with an interface. If the candidate name is "util", the content is: (a) a **capability** → name it (`text`, `parse`, `http`); (b) a **domain** concept → name it (`cnpj`, `period`, `pncp/id`); or (c) it **should not exist** → inline it as a combinator (`Array.filter`/`reduce`, `Schema`).

## Layout

```
src/
  main.ts · runtime.ts            # thin entrypoint + AppLayer = mergeAll(sources)
  kernel/                         # deep core, by capability
    mcp/   (tool.ts, server.ts, prompts.ts, resources.ts)
    db/    (client.ts PGlite Layer, drizzle.ts)
    http/  (client.ts, tagged.ts)
    parse/ · text.ts · paths.ts
  domain/  (cnpj.ts, uf.ts, response.ts)   # shared vocabulary
  sources/<source>/  index.ts(barrel) tools.ts query.ts indexer.ts store.ts errors.ts data.ts <source>.test.ts
```

## Fixed naming (kills the current drift)

`index.ts` (public) · `query.ts` (not `service`) · `store.ts` (not `db`) · `indexer.ts` · `errors.ts` · `data.ts` (not `catalog`) · `mapper.ts` (not `mappers`/`mapping`) · **kebab-case always** (not `dataDir.ts`).

## Status

accepted. The folder migration follows the module-by-module migration in the roadmap; it is not a big-bang PR.
