---
name: static-checks-authoring
description: Use when adding or changing a rule in tooling/static-checks/check-declarative-errors.ts (the lint:errors gate). Covers the AST-walk model, the two-tier strictPrefixes contract, the shared helpers, and the iron rule that every new rule must be proven false-positive-clean against the six gold files before it lands.
---

# Extending the declarative-error static checks

`tooling/static-checks/check-declarative-errors.ts` is the `bun run lint:errors` gate. It is **AST-based** (`ts.createSourceFile` + recursive `ts.forEachChild` walk over the typescript compiler API), not regex/line-based. AST is non-negotiable here: regex cannot tell a TS `as` cast (`ts.AsExpression`) from a SQL `as` alias inside a drizzle `sql\`...\`` template (`TemplateExpression`) or `import * as` (`NamespaceImport`).

## The model

- `walk(root)` yields every checked file under the requested roots (default `["src"]`); `shouldSkip` drops `dist`/`node_modules`/`__tests__`/`test`/etc.
- Per file: `const strict = strictPrefixes.some((p) => rel.startsWith(p))` where `strictPrefixes = ["src/kernel/", "src/sources/"]`.
- `collect(file, source, strict)` runs `visit(node, inGetMessage)` recursively. Dispatch on **named** `ts.SyntaxKind` constants and `ts.isXxx` type guards — never literal kind numbers (in TS 6, `VariableStatement === 244`, not 245).
- `at(node, rule, message)` records a violation with line/column. Any violation → `process.exit(1)`.

## Two tiers

- **universal** (all of `src/`, legacy included): `no-throw`, `no-instanceof`, `no-statement-try-catch-finally`, `no-error-helper-functions`. Keep these cheap and unambiguous — legacy `src/modules/**` must stay green.
- **v2-strict** (only `src/kernel/`, `src/sources/`): everything else, inside the `if (strict) { ... }` block. This is where the gold-standard Effect idiom is enforced.

New rules almost always go in the strict block.

## Shared helpers (reuse, don't reinvent)

- `text(node, source)` — `node.getText(source)` with whitespace collapsed. Use it before any string compare so newlines don't defeat the match.
- `bodyHasNewError` / `containsSwitch` — bounded recursive finders.
- `taggedErrorFields(classDecl)` — the `Schema.TaggedErrorClass(...)` options object literal.
- `fileHasLayerExport(source)` — does the file export a `Layer.*` binding (for the service-needs-layer rule).
- `widenedError` / `bannedServiceApi` — the exact-match sets for the error-channel and v3-service rules.

## The iron rule

A new rule must be **false-positive-clean on the gold standard** before it lands. Two-step proof, every time:

1. The rule must NOT fire on any of the six gold files:
   - `src/kernel/{http,db,embed}/client.ts|embedder.ts`, `src/sources/legislacao/{catalog,indexer,store}.ts`.
   - Verify: `bun tooling/static-checks/check-declarative-errors.ts src/kernel src/sources` → **exit 0**.
2. The rule MUST fire on a synthetic violator. Drop a throwaway `src/sources/__lint_probe__.ts`, run the checker, confirm the rule appears, then delete it.

If a rule cannot be made FP-safe on the gold standard without an escape-hatch comment, **do not add it** — document the principle in `effect-v4-source-authoring` instead. Examples deliberately left as docs, not rules: `no-string-cause-erasure` (no syntactic signal distinguishes lossy from opaque), `no-raw-json-ingestion` (deferred until a JSON Source exists — `.json()` matcher is FP-prone), `duration-internally` (fights the gold standard's number-at-config idiom), `no-hidden-effect-provide` (needs a scope/type check the AST walker lacks).

## AST gotchas confirmed in this codebase

- `Effect.Effect<A, E>` is a `ts.TypeReferenceNode` whose `typeName` is a `ts.QualifiedName` (`Effect` . `Effect`), not an Identifier. The E channel is `typeArguments[1]`; index 0 is the success channel.
- `Effect.Service` / `Context.Tag` are `ts.PropertyAccessExpression` — match on `text(node, source)` against an exact set.
- A service class's base is `node.heritageClauses.find(ExtendsKeyword).types[0].expression`, a `ts.CallExpression`; test `text(base.expression, source).startsWith("Context.Service")`.
- `{ concurrency: "unbounded" }` is a `ts.PropertyAssignment` with a `ts.StringLiteral` initializer; `{ concurrency: 2 }` is a `ts.NumericLiteral`, so a string-literal-only matcher leaves bounded fan-out alone.
- `as const` is an `AsExpression` whose `type` text is `"const"` — exempt it. `satisfies` is its own node, not an `AsExpression`.

Keep rule messages in Effect vocabulary; no comments in the checker itself.
