# 0001 — Effect v4 + PGlite + Drizzle como fundação da v2

A v2 troca, de uma vez, a camada de dados (SQLite → **PGlite** + **Drizzle** + `drizzle-zod`) e o modelo de efeitos/erros (`better-result`+`evlog` → **Effect v4**). Effect não é "+1 lib": é o próprio erro-como-valor (`Effect<A, E, R>`), e absorve a decisão kysely-vs-Drizzle via `@effect/sql-pglite` + `@effect/sql-drizzle`. Erros evlog viram `Data.TaggedError` com código estável + mensagem pt-BR.

## Considered Options

- **kysely (WIP do baseline)** — mantido só como compilador de SQL; descartado: `@effect/sql-drizzle` é o caminho abençoado no v4.
- **v3 estável agora, v4 depois** — descartado: evita migração dupla; aceitamos o beta.

## Status

accepted — Effect v4 está em **beta** (`effect@4.0.0-beta.x`). Risco assumido: versão fixada sem `^`, lockfile commitado, bumps de beta deliberados lendo changelog. HttpClient mora em `effect/unstable/http` (v4 unificou os `@effect/platform`).

## Consequences

- `bun:sqlite` e `better-result` saem ao fim da migração (módulo a módulo).
- DB vira `Layer` com lifecycle por `Scope`; fim de `getDb` cache global + `closeAllDbs`.
- Ver roadmap em `docs/ROADMAP_V2.md`.
