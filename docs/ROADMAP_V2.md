# Roadmap v2 — dados-publicos-mcp

> **Status: COMPLETA.** A refatoração suprema acabou. O v1→v2 cutover já entrou em `main`:
> servidor 100% **Effect v4 native**, fundação de dados trocada (SQLite → **PGlite** + Drizzle),
> modelo de efeitos/erros trocado (`better-result`+`evlog` → Effect), e o legado **deletado**.
> Este arquivo agora é registro histórico + lista de follow-ups opcionais.

## O que entregou (M1–M4)

### Fundação (ADR-0001, ADR-0002)

- **Um único PGlite** aberto como `Layer` com lifecycle por `Scope` (`src/kernel/db/client.ts`),
  servido ao `PgClient` (`@effect/sql-pg`) por unix socket (`pglite-socket`) — Postgres genuíno,
  Drizzle (`drizzle-orm/effect-postgres`) como query builder. Fim do `getDb`/`closeAllDbs`.
- **Quatro extensões** habilitadas na abertura: `vector` (pgvector), `pg_textsearch` (BM25),
  `ltree`, `pg_trgm`.
- **Busca híbrida**: BM25 ⊕ pgvector fundidos por **RRF**, com `pg_trgm` (fuzzy) e `ltree`
  (hierarquias — CNAE, CATMAT/CATSER, árvore de legislação). Embeddings calculados **localmente**
  (`@huggingface/transformers`, `src/kernel/embed/`).
- **Persistência**: `DADOS_PUBLICOS_MCP_DATA_DIR` resolvido via `Config` (fallback XDG / default
  por plataforma) em `src/kernel/db/persistence.ts`, ligado abaixo do `DbLayer` no `runtime.ts` —
  os índices **persistem entre execuções**.

### Stack final (versionamento unificado Effect — `effect@4.x` ↔ `@effect/*@4.x`)

| Dep | Papel |
|---|---|
| `effect@4.0.0-beta.81` | runtime de efeitos, erros tipados (`Schema.TaggedErrorClass`), `Layer`, `Scope`, concorrência, **CLI** (`effect/unstable/cli`), **HTTP** (`effect/unstable/http`) |
| `@effect/platform-bun@4.0.0-beta.81` | `BunRuntime.runMain` + `BunServices.layer` (Environment da CLI) |
| `@effect/sql-pg@4.0.0-beta.81` | `PgClient` sobre o socket do PGlite |
| `drizzle-orm@1.0` | schema + query builder (`effect-postgres`) |
| `@electric-sql/pglite` + `@electric-sql/pglite-socket` | banco embutido local-first + socket |
| `@huggingface/transformers` | embeddings locais |
| `@modelcontextprotocol/sdk` | servidor MCP (borda fina, Effect-native por cima) |

> **Pino exato** de `effect`/`@effect/*` (sem `^`); `bun.lock` commitado; bumps de beta são PRs
> deliberados, com changelog lido. Risco de beta mantido conscientemente (evita migração dupla v3→v4).

### Migração de fontes (M3)

Todas as **12 fontes** migradas para slice Effect-native (`src/sources/<source>/` = `store.ts` +
`query.ts` + `indexer.ts` + `errors.ts` + `data.ts` + teste colocado), cada uma um `Context.Service`
+ `XLive` `Layer`, todas persistindo na mesma PGlite:

`legislacao` · `ibge-localidades` · `cnae` · `catmat-catser` · `sicaf-fornecedores` ·
`sancoes-cgu` · `receita-cnpj` · `tse-eleitoral` · `camara-deputados` · `querido-diario` ·
`capag` · `pncp`.

### Borda MCP (camada de tools)

`src/serve/` — tools declaradas como **dados** (`{ name, schema, handler }`) e folded por um
`defineTool` profundo (`tool.ts`/`fold.ts`); zero `registerTool`/`IndexAdapter`/registry legado.
**58 tools** = 44 query + 8 index + `status_indices` + 5 `guia_*` (skills que retornam receita de
composição em markdown para o agente ingerir; `foldExit` renderiza string como texto cru). O servidor
é Effect-native sobre o `@modelcontextprotocol/sdk` `Server`.

### CLI

`src/index.ts` em `effect/unstable/cli` (`Command`/`Flag`/`Argument`) + `@effect/platform-bun`
(`BunRuntime.runMain`). Sem subcomando → `serve` (stdio). Subcomando `index [fonte]` (re)cria
índices, com recortes `--include-heavy` / `--ufs` / `--anos` / `--mes`. `cac` removido.

### Legado removido (M4)

Deletados: `src/modules/**`, `src/core/**`, `better-result`, `evlog`, `zod`, `dayjs`, `bun:sqlite`,
`cac`, `kysely`. Removidos também: índices por-fonte em JSON/SQLite/FTS5, as tools de API ao vivo do
PNCP, `prompts`/`resources` MCP, tools `status_*` por fonte, a camada "online/tempo-real", e
`__tests__`/`bun test`.

## O gate

`bun run check` = `tsc --noEmit` + `lint:errors` (AST checker — tier **estrito** só em `src/kernel/`
e `src/sources/`) + `vitest run` (`test:unit`). Verde é obrigatório antes de fechar qualquer mudança.
Não há `bun test`.

---

## Matriz de extensões (issue #2, Fase 5)

Quais extensões PGlite/Postgres são candidatas, para quais fontes, e o benefício esperado.
**Adotadas** já estão em produção (`src/kernel/db/client.ts`); **candidatas** são follow-ups.

| Extensão | Estado | Fontes / colunas | Benefício |
|---|---|---|---|
| `vector` (pgvector) | **adotada** | todas as `busca`/`embedding` — legislacao, cnae, catmat-catser, pncp, querido-diario, … | similaridade semântica (braço vetorial do RRF) |
| `pg_textsearch` (BM25) | **adotada** | todas as colunas `busca` (`*_busca_bm25`) | ranking lexical BM25 (braço léxico do RRF) |
| `pg_trgm` | **adotada** | nomes: ibge `municipio`, sicaf/receita/sancoes/tse/camara `busca`, candidato | fuzzy / typo-tolerância (`word_similarity`, fallback do BM25) |
| `ltree` | **adotada** | legislacao `path`, cnae/catmat-catser hierarquias | árvores (PageIndex, CNAE, CATMAT/CATSER) por `@>`/`<@`/`~` |
| `unaccent` | candidata | qualquer `busca` | busca sem acento sem normalizar em JS (hoje normalizamos via `kernel/text`) |
| `fuzzystrmatch` | candidata | nomes de pessoas/empresas | `levenshtein`/`metaphone` onde trigram erra |
| `citext` | candidata | siglas/UF/códigos | comparação case-insensitive sem `lower()` |
| `btree_gin` | candidata | filtros `ano`/`uf` ao lado de GIN | um índice composto para filtro+texto |
| `pg_ivm` | candidata | pncp, receita-cnpj | materialized views incrementais para agregações pesadas |
| `pg_stat_statements` / `auto_explain` | candidata | global | observabilidade casada com tracing Effect |
| `earthdistance` / PostGIS | fora de escopo | — | só se entrar recorte geográfico real |

## Achados da revisão pré-publicação (registro)

Revisão adversarial multi-agente do stack antes do publish. Decisões registradas:

- **Corrigido** — índice `gin_trgm` ausente em `receita.busca` e `despesa.busca` (TSE): o fallback
  `word_similarity` fazia seq scan. Adicionados `receita_busca_trgm` / `despesa_busca_trgm`.
- **Corrigido** — descrições de tool defasadas (`FTS5`/`FTS local` → BM25 ⊕ vetorial RRF + `pg_trgm`).
- **Por design (não é bug)** — `row_number() over ()` sobre o subquery BM25 ordenado+limitado. O
  operador `<@>` do `pg_textsearch` **exige índice** e não pode ser projetado no `SELECT` (`error:
  text <@> tpquery operator requires index`); a única forma de ranquear é `order by busca <@>
  to_bm25query(q) limit N` e numerar a saída materializada. Em PGlite (WASM single-thread) a ordem é
  preservada de forma determinística. Tentativa de expor a distância como coluna foi revertida.
- **Por design** — filtros (`ano`/`uf`/território) aplicados **fora** do subquery BM25 ranqueado, não
  dentro: mesma restrição do operador. Mitigação possível (subir `candidates`) é tuning, não correção.
  Segue como follow-up de qualidade de recall.
- **Follow-up** — `cnae.search` retornar a hierarquia completa como `resolve`; CTE de score única no
  fallback trgm de sancoes; índice trgm em `diario.busca` (hoje o fallback é vetorial).

## Follow-ups opcionais (não bloqueiam nada)

- [ ] **Re-adicionar campos de filtro derrubados** no cutover — estender os stores/queries das fontes
      afetadas (novas colunas + índices) sem mudar o contrato das tools existentes.
- [ ] **Cache de embeddings de query** — um `Layer` de `Cache` opcional para memoizar o embedding de
      termos de busca repetidos, cortando latência das tools híbridas.
- [ ] **Postgres real opcional** — `DADOS_PUBLICOS_MCP_DB_BACKEND=pglite` (default) | `postgres`
      (troca só o Layer do client; mesmo Drizzle, mesmo dialeto). Nunca bloqueia o uso local.
- [ ] **Materialização** (`pg_ivm`) para fontes pesadas (PNCP/Receita), se o custo/benefício compensar.
- [ ] **Observabilidade** (`pg_stat_statements`, `auto_explain`) casada com tracing Effect.

## Marcos (todos atingidos)

- **M1 — Fundação decidida:** ADR-0001/0002 escritos, lint:errors em AST. ✅
- **M2 — Tracer bullet:** `legislacao` em Effect+PGlite+Drizzle, erros tagged, check verde. ✅
- **M3 — Tudo migrado:** 12 fontes na fundação nova. ✅
- **M4 — Legado morto:** `bun:sqlite`+`better-result`+`evlog`+`cac` removidos, docs reescritas. ✅
