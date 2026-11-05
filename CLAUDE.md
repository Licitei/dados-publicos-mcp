# CLAUDE.md

Read **AGENTS.md** for the map. This file is the load-bearing subset.

## The gate

`bun run check` = `typecheck` (`effect-tsgo tsrs --noEmit --fast`, every Effect diagnostic at error) + `lint`
(`tooling/lint`: oxlint with effecttsgo strict + the `dados-publicos/*` plugin, source-policy, reuse-policy, knip,
konsistent, oxfmt) + `test:unit`. It is the only gate (no CI). Make it green before finishing any change.

**The lint is the rulebook.** Every code convention (no comments, no `as`, no `let`, Match over switch, typed errors,
Schema-derived shapes, import boundaries, no mocks in tests...) is a lint rule with a fixture test in
`tooling/lint/__tests__`. If a rule is wrong, fix the rule and its fixtures; never add disable comments, never
work around it. Run `bun run format` before the gate.

## Stack in one breath

Effect v4 · Bun · tabular data in one DuckDB file (`Duck`, bm25 fts) · typo fallback via fff fuzzy (`Fuzzy`) ·
laws/precedents as git-cloned Markdown searched by fff (`Search`, `CorpusGit`) · Alchemy versions every local index
(`infra/`). No embeddings, no SQL server, no DuckLake (it can't hold an fts index).

## Style the lint cannot see

- pt-BR only in user-facing strings (error `message` getters, tool descriptions, guia text); everything else English.
- Declarative: declared data + combinators over glue functions.
- Commit or push **only when asked**.
