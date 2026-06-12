# CLAUDE.md

Read **AGENTS.md** for the full picture. This file is the load-bearing subset.

## Before writing a line: which world?

This repo is mid-migration and lives in two layers at once.

- **v2 — Effect-native (target)**: `src/kernel/**`, `src/sources/**`. Effect v4 + PGlite + Drizzle.
  English identifiers. Errors are `Schema.TaggedErrorClass` + `Effect.fail`. **v2-strict** static
  rules apply here.
- **v1 — legacy (still the live serving path)**: `src/modules/**`, `src/core/**`, `src/index.ts`.
  `better-result` + `evlog` + `bun:sqlite`. pt-BR identifiers. Only the universal static rules apply.

`serve` still wires the legacy `src/modules/legislacao`, not `src/sources/legislacao`. The v2 slice
is reference architecture awaiting promotion — match the world of the file you are editing; don't mix.

## The gate

`bun run check` (typecheck + `lint:errors` + `bun test` + `vitest`) — the only gate, no CI. Make it
green before finishing any change.

`lint:errors` is an **AST** linter (`tooling/static-checks/check-declarative-errors.ts`), two tiers.
Every rule must be false-positive-clean on the six gold files.

## v2 invariants (when in `src/kernel`/`src/sources`)

- Gold standard = `src/kernel/http/client.ts`. Copy its idiom.
- `Schema.Literals` codes; `Schema.TaggedErrorClass` with `get message()` switch (pt-BR); error built
  inline at the failure site (no helper). `Context.Service` + exported `Layer.effect`; shape via
  `Effect.Success<typeof make>`; config via `Context.Reference`.
- `Match` for branching; `switch` only in `get message()`. Errors via `Effect.fail` — never `throw`.
- No `as` casts, no `let`/`var`, no `enum`, no `while`, no statement `try/catch`, no comments, no
  barrels. Bounded fan-out (`concurrency: 2`); classified retry; JSON decoded through a Schema.
- Adding a Source → use the `effect-v4-source-authoring` skill.

## Style (both worlds)

- English code/files/comments — but **no code comments at all**, including JSDoc.
- pt-BR **only** inside user-facing error message strings.
- Declarative: declared data + combinators (`Match`/`Layer`/`Schema`) over glue functions.
- Commit or push **only when asked**.
