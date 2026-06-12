# Roadmap v2 — dados-publicos-mcp

> Branch `v2`. Baseline = estado atual de `main` (commit `a8e137a`).
> A v2 é a refatoração suprema, **track único**: trocar a fundação de dados **e** o modelo de
> efeitos/erros de uma vez, construir as tools local-first/privacy-first em cima, tudo
> **Effect v4 native**.

## Decisão fundadora (ADR-0001)

Combinar as três issues numa só fundação:

- **#2** SQLite → **PGlite**, com **Drizzle** como camada de schema/query.
- **#4** `better-result`+`evlog` → **Effect v4** (Effect É o erro-como-valor; substitui, não soma).
- **#3** tools local-first construídas sobre essa fundação.

**Stack (versionamento unificado Effect — `effect@4.x` ↔ `@effect/*@4.x`):**

| Dep | Papel |
|---|---|
| `effect@4.0.0-beta.x` | runtime de efeitos, erros tipados, Layer, Scope, concorrência |
| `@effect/sql` + `@effect/sql-pglite` | client SQL + adapter PGlite como **Layer** (lifecycle do DB) |
| `@effect/sql-drizzle` | Drizzle como query builder sobre o client Effect |
| `drizzle-orm@1.0` | schema (suporte nativo a Effect v4) |
| `drizzle-zod` | mata duplicação schema↔tipo↔validação |
| `@electric-sql/pglite` | banco embutido local-first |

> **kysely WIP morre.** `src/core/store/kysely.ts` + `query.ts` (no baseline) ficam órfãos sob
> esta decisão — `@effect/sql-drizzle` é o caminho. Removidos na Fase 1/4.

### Postura de risco: Effect v4 está em **beta**

v3 ainda é o estável; v4 vira LTS quando estabilizar. Vamos **all-in no beta** mesmo assim
(evita migração dupla v3→v4). Mitigação obrigatória:

- **Fixar versão exata** de `effect` e todos `@effect/*` (mesmo número), sem `^`.
- Lockfile (`bun.lock`) commitado; upgrades de beta são PRs deliberados, nunca automáticos.
- Ler o changelog de cada bump de beta — API do v4 ainda muda.

## Princípios inegociáveis

- **Effect native**: lógica de domínio retorna `Effect<A, E, R>`. Erros são valores tipados
  (canal `E`), nunca `throw` para fluxo esperado. Sem `try`/`catch`/`finally` statement-level
  em `src/` — recursos via `Scope`/`Effect.acquireRelease`, não `try/finally`.
- **Erros = `Data.TaggedError`**: cada erro evlog vira uma classe `Data.TaggedError` com
  **código estável + mensagem pt-BR** como campos. Catálogo pt-BR preservado.
- **Borda MCP fina**: tools rodam o efeito (`Effect.runPromise`) e serializam o resultado no
  formato atual (`Result.serialize()`-equivalente: `{ ok, value } | { ok:false, error }`).
  Contrato MCP **inalterado**.
- **DB como Layer**: lifecycle do PGlite vive num `Layer`/`Scope` central — fim do singleton
  manual `getDb`/`closeAllDbs`. Nenhum `db.close()` em módulos.
- **Bun native**: I/O com `Bun.file`/`Bun.write` quando houver equivalente. Effect roda em Bun.
  PGlite é WASM, encapsulado no Layer. Sem runtime Node obrigatório. Sem npm/yarn/pnpm.
- **Local-first / privacy-first**: `start`/`index`/`check` sem serviço externo; nada do usuário
  sai para terceiros.
- **Vertical slice**: cada fonte = `tools → service → indexer → store → errors`, em
  `src/core/registry.ts`. Migração módulo a módulo, PRs pequenos.
- **`bun run check` verde** antes de fechar qualquer mudança.

### Tooling de static-checks (precisa evoluir na Fase 0)

`lint:errors` hoje bane `throw`/`try`/`catch` e helpers `better-result`. Com Effect:

- `throw`/`try`/`catch`/`finally` continuam banidos (Effect satisfaz nativamente).
- Banir helpers `better-result` deixa de fazer sentido → trocar por convenções Effect (ex:
  proibir `Effect.runSync`/`runPromise` fora da borda MCP; proibir `Effect.die`/`throw` em
  services; exigir erros via `Data.TaggedError`).

---

## Fase 0 — Decisão arquitetural + tooling

- [ ] **ADR-0001** registrado: SQLite→PGlite **+** better-result→Effect v4 **+** evlog→TaggedError,
      com a stack e a postura de risco (beta) acima.
- [ ] Atualizar `lint:errors` (`tooling/static-checks/`) para as convenções Effect.
- [ ] `AGENTS.md` / `README.md` marcados como "em migração p/ Effect v4 + PGlite".

**Saída:** direção escrita; gate de lint não bloqueia código Effect.

## Fase 1 — Tracer bullet Effect + PGlite + Drizzle (`legislacao`)

Prova de que os **três** eixos funcionam juntos num módulo real.

- [ ] Adicionar a stack (versões fixas, lockfile).
- [ ] `Layer` central do PGlite via `@effect/sql-pglite` (client + lifecycle por `Scope`).
- [ ] Schema Drizzle de `legislacao` (+ `drizzle-zod`), queries via `@effect/sql-drizzle`.
- [ ] Migrar o catálogo de erros de `legislacao` para `Data.TaggedError` (código + msg pt-BR).
- [ ] `service` retorna `Effect<A, E, R>`; `tools` rodam na borda e serializam no contrato MCP atual.
- [ ] `indexer` end-to-end: index → status → consulta, com retry/timeout declarativo.
- [ ] Remover `kysely.ts`/`query.ts` se já sem consumidores; testes passam sem rede pública.

**Saída (M2):** `legislacao` rodando Effect+PGlite+Drizzle, `check` verde. Padrão replicável.

## Fase 2 — Padrões reutilizáveis

Extrair do tracer bullet o que todo módulo reusa:

- [ ] Helper de borda MCP: `Effect` → `Result.serialize()`-equivalente (um lugar só).
- [ ] Convenção `Data.TaggedError` por módulo (base + códigos pt-BR).
- [ ] Layer de store parametrizável por domínio; `drizzle-zod` onde reduz duplicação real.
- [ ] Pt-BR preservado nos nomes públicos.

## Fase 3 — Migração incremental dos módulos

Ordem (leve → pesado), PRs pequenos. Cada um: schema Drizzle + Layer/indexer PGlite +
service `Effect<A,E,R>` + erros `Data.TaggedError` + tools sem mudança de contrato + testes
equivalentes/melhores.

1. [ ] `legislacao`, `cnae`  *(legislacao já vem da Fase 1)*
2. [ ] busca textual: `catmat-catser`, `querido-diario`, `sancoes-cgu`
3. [ ] pesados: `dados-publicos` (PNCP), `receita-cnpj`, `tse-eleitoral` — aqui a **concorrência
       estruturada** do Effect (controle de paralelismo, cancelamento, retry) paga mais.
4. [ ] restantes: `camara-deputados`, `capag`, `ibge-localidades`, `sicaf-fornecedores`

## Fase 4 — Remoção do legado

- [ ] Remover `bun:sqlite` da camada de store; helpers órfãos (`openDb`, `openReadonly`,
      `batchInsert`, `countRows`, `kysely.ts`, `query.ts`).
- [ ] Remover `better-result` + helpers `evlog` antigos após último consumidor migrado.
- [ ] `README.md`/`AGENTS.md` reescritos para Effect v4 + PGlite (tirar "em migração").
- [ ] Índices SQLite antigos: rebuild recomendado (default); migração automática só se
      custo/benefício compensar.

## Fase 5 — Extensões PGlite/Postgres

Matriz documentada: extensão → módulo → benefício. Acessadas via Layer do store.

- **Busca/matching:** `unaccent`, `pg_trgm`, `pg_textsearch` (BM25), `fuzzystrmatch`, `citext`.
- **Semântica:** `pgvector` + embedding local (Transformers.js multilingual pequeno / Ollama
  opcional / ONNX só se empacotamento compensar).
- **Índices/estruturas:** `btree_gin`, `btree_gist`, `bloom`, `ltree` (CNAE/CATMAT/CATSER).
- **Observabilidade:** `pg_stat_statements`, `auto_explain`, `amcheck` — casa com tracing Effect.
- **Geo (se entrar no escopo):** `earthdistance`, PostGIS experimental.
- **Materialização:** `pg_ivm` (views incrementais p/ PNCP/Receita) se fizer sentido.

## Fase 6 — Postgres real opcional

- [ ] `DADOS_PUBLICOS_MCP_DB_BACKEND=pglite` (default) | `postgres` (avançado, troca só o Layer
      p/ `@effect/sql-pg` — mesmo Drizzle, mesmo dialeto).
- [ ] Nunca bloqueia o uso local básico com PGlite.

---

## Trilha de produto — tools local-first (#3, sobre a fundação)

Cada tool: análise **preliminar/explicável**; retorna `fontes`, `limitacoes`, `confianca` e
`{ privacidade: { modo: "local", dadosEnviadosParaTerceiros: false } }`. Sem relatório formal,
sem parecer jurídico, sem login/telemetria/cloud. Implementadas como `Effect`, serializadas na borda.

- [ ] `pesquisar_preco_lite` — preços preliminares (PNCP + IBGE + CATMAT/CATSER + fuzzy/vetorial).
- [ ] `buscar_compras_similares` — `unaccent`+full-text, `pg_trgm`, `pgvector` quando houver embeddings.
- [ ] `normalizar_item_lite` — normaliza item via CATMAT/CATSER + histórico.
- [ ] `triagem_fornecedor_local` — CNPJ: Receita + sanções + SICAF + histórico PNCP.
- [ ] `resumir_contratacao_local` — resume contratação por número PNCP / dados locais.
- [ ] `mapear_mercado_publico_lite` — visão de mercado por termo/UF/órgão/fornecedor.

---

## Marcos

- **M1 — Fundação decidida:** ADR-0001 escrito + lint:errors atualizado. *(fim Fase 0)*
- **M2 — Tracer bullet:** `legislacao` em Effect+PGlite+Drizzle, erros TaggedError, check verde. *(fim Fase 1)*
- **M3 — Tudo migrado:** 12 módulos na fundação nova. *(fim Fase 3)*
- **M4 — Legado morto:** `bun:sqlite` + `better-result` removidos, docs reescritas. *(fim Fase 4)*
- **M5 — Produto local-first:** ≥1 tool de inteligência (#3) entregue sobre a fundação.
- **M6 — Extensões:** matriz + ≥1 em produção (ex: `pg_trgm`/`unaccent`). *(Fase 5)*
