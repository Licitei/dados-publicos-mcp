# Roadmap v2 — dados-publicos-mcp

> Branch `v2`. Baseline = estado atual de `main` (commit `a8e137a`), incluindo o WIP
> que introduziu **kysely como compilador de SQL** sobre `bun:sqlite`.
> A v2 é a refatoração suprema: trocar a fundação de dados, construir as tools
> local-first/privacy-first em cima dela e deixar a porta aberta para Effect v4.

## Princípios inegociáveis (herdados de `main`, valem em toda a v2)

- **Better Result native**: APIs retornam `Result<T, EvlogError>`. Sem `throw` para fluxo
  esperado. Sem `try`/`catch`/`finally` statement-level em `src/`. Erro construído inline no
  ponto de decisão — sem `toXError`/`wrapError`/`fromError`.
- **Bun native**: I/O com `Bun.file`/`Bun.write` quando houver equivalente. Sem runtime Node
  obrigatório. Sem npm/yarn/pnpm.
- **Local-first**: `bun run start`, `bun run index`, `bun run check` funcionam sem nenhum
  serviço externo. Sem Docker para o fluxo básico.
- **Privacy-first**: nenhuma consulta, CNPJ, item de edital ou análise sai para terceiros.
- **Vertical slice**: cada fonte = `tools → service → indexer → store → errors`, registrada
  em `src/core/registry.ts`. Migração módulo a módulo, PRs pequenos.
- **`bun run check` verde** (typecheck + lint:errors + test) antes de fechar qualquer mudança.

## As três issues e como se encaixam

| Issue | Tema | Papel na v2 |
|---|---|---|
| **#2** | PGlite + Drizzle + drizzle-zod | **Fundação.** Tudo depende disto. |
| **#3** | Tools local-first / privacy-first para licitação | **Produto.** Construído sobre #2. |
| **#4** | Avaliar Effect v4 | **Futuro.** Spike só após #2 ter tracer bullet. Não bloqueia nada. |

Ordem de execução: **#2 (fundação) → #3 (produto) → #4 (avaliação)**.

---

## Decisão pendente do dia 0: kysely (WIP) vs Drizzle (#2)

O baseline da v2 já carrega `src/core/store/kysely.ts` + `query.ts`: kysely usado **só como
compilador** (`.compile()` → `{ sql, parameters }`), nunca como executor, sobre o handle
`bun:sqlite` singleton. A issue #2 propõe **Drizzle** como camada padrão.

São direções concorrentes para a mesma camada. **Primeiro entregável da v2 é resolver isto**
no ADR-0001:

- **Opção A — Drizzle (segue #2):** dialeto PG, `drizzle-zod` para matar duplicação
  schema↔tipo↔validação, `drizzle-kit` para migrations. Custo: reescrever a camada de query
  recém-criada; aprender ergonomia Drizzle + PGlite.
- **Opção B — kysely + PGlite:** mantém o compilador-de-SQL já escrito, troca só o dialeto/driver
  para PGlite. SQL fica explícito (objetivo declarado no header do `kysely.ts`). Custo: perde
  `drizzle-zod`; valida tipos à mão.
- **Opção C — híbrido:** Drizzle para schema + `drizzle-zod`; kysely para queries complexas.
  Custo: duas libs na camada de dados.

> **Ação:** registrar a escolha em `docs/adr/0001-sqlite-para-pglite.md` **antes** do tracer
> bullet. Sem decisão registrada, a Fase 1 não começa.

---

## Fase 0 — Decisão arquitetural (#2 Fase 0)

- [ ] ADR-0001: SQLite → PGlite. Motivação (dialeto PG, extensões, rota p/ Postgres real,
      base p/ embeddings) + trade-offs (peso WASM/PGlite vs `bun:sqlite`, catálogo de extensões
      menor que Postgres real, migração dos índices locais existentes).
- [ ] ADR-0001 também fecha a decisão **kysely vs Drizzle vs híbrido** acima.

**Saída:** direção da camada de dados definida e escrita.

## Fase 1 — Tracer bullet PGlite (#2 Fase 1)

- [ ] Adicionar `@electric-sql/pglite` (+ `drizzle-orm` + `drizzle-zod` se Opção A/C).
- [ ] Store PGlite central com lifecycle = singleton atual (`getDb`/`openReadonly`/`closeAllDbs`).
      `db.close()` só centralizado — nunca nos módulos.
- [ ] Migrar **`legislacao`** (ou `cnae`) end-to-end: index → status → consulta.
- [ ] Contrato público de service/tools **inalterado** (`Result.serialize()` na borda MCP).
- [ ] Testes do módulo migrado passam sem rede pública.

**Saída:** um módulo real rodando em PGlite, prova de que a fundação funciona.

## Fase 2 — Schemas por módulo (#2 Fase 2)

- [ ] Schema Drizzle (ou equivalente da Opção escolhida) por vertical slice.
- [ ] `drizzle-zod` onde reduzir duplicação **real** schema↔tipo↔validação.
- [ ] Nomes públicos em pt-BR preservados (linguagem de domínio).

## Fase 3 — Migração incremental dos módulos (#2 Fase 3)

Ordem (leve → pesado), PRs pequenos. Cada um entrega: schema + indexer PGlite + service
`Result<T, EvlogError>` + tools sem mudança de contrato + testes equivalentes/melhores.

1. [ ] `legislacao`, `cnae`  *(legislacao já vem da Fase 1)*
2. [ ] busca textual: `catmat-catser`, `querido-diario`, `sancoes-cgu`
3. [ ] pesados: `dados-publicos` (PNCP), `receita-cnpj`, `tse-eleitoral`
4. [ ] restantes: `camara-deputados`, `capag`, `ibge-localidades`, `sicaf-fornecedores`

## Fase 4 — Remoção do SQLite (#2 Fase 4)

- [ ] Remover `bun:sqlite` da camada de store.
- [ ] Remover helpers órfãos (`openDb`, `openReadonly`, `batchInsert`, `countRows`, ...).
      Decidir destino de `kysely.ts`/`query.ts` conforme ADR-0001.
- [ ] Atualizar `README.md`, `AGENTS.md` para PGlite.
- [ ] Estratégia p/ índices SQLite antigos: rebuild recomendado (default) vs migração automática
      só se custo/benefício compensar.

## Fase 5 — Extensões PGlite/Postgres (#2 Fase 5)

Matriz documentada: extensão → módulo → benefício. Começar pelas de valor direto.

- **Busca/matching:** `unaccent`, `pg_trgm`, `pg_textsearch` (BM25), `fuzzystrmatch`, `citext`.
- **Semântica:** `pgvector` + embedding local (avaliar Transformers.js multilingual pequeno /
  Ollama opcional / ONNX só se empacotamento compensar).
- **Índices/estruturas:** `btree_gin`, `btree_gist`, `bloom`, `ltree` (hierarquias
  CNAE/CATMAT/CATSER).
- **Observabilidade:** `pg_stat_statements`, `auto_explain`, `amcheck`.
- **Geo (se entrar no escopo):** `earthdistance`, PostGIS experimental.
- **Materialização:** `pg_ivm` (views incrementais p/ PNCP/Receita) se fizer sentido.

## Fase 6 — Postgres real opcional (#2 Fase 6)

- [ ] `DADOS_PUBLICOS_MCP_DB_BACKEND=pglite` (default) | `postgres` (avançado).
- [ ] Nunca bloqueia o uso local básico com PGlite.

---

## Trilha de produto — tools local-first (#3, depois de #2 estável)

Cada tool: análise **preliminar/explicável**, retorna `fontes`, `limitacoes`, `confianca` e
metadados de privacidade `{ modo: "local", dadosEnviadosParaTerceiros: false }`. Sem relatório
formal, sem parecer jurídico, sem login/telemetria/cloud.

- [ ] `pesquisar_preco_lite` — preços preliminares (PNCP + IBGE + CATMAT/CATSER + busca fuzzy/vetorial).
- [ ] `buscar_compras_similares` — `unaccent`+full-text, `pg_trgm`, `pgvector` quando houver embeddings.
- [ ] `normalizar_item_lite` — normaliza item via CATMAT/CATSER + histórico.
- [ ] `triagem_fornecedor_local` — CNPJ: Receita + sanções + SICAF + histórico PNCP.
- [ ] `resumir_contratacao_local` — resume contratação por número PNCP / dados locais.
- [ ] `mapear_mercado_publico_lite` — visão de mercado por termo/UF/órgão/fornecedor.

## Trilha futura — Effect v4 (#4, não bloqueia nada)

Retomar **só quando**: Effect v4 maduro **e** #2 tem tracer bullet funcional. Spike isolado em
módulo pequeno (`cnae`/`legislacao`) → interop `EvlogError`↔Effect errors → I/O Bun-native →
indexador com concorrência estruturada → decisão registrada em ADR. Migrar só se o ganho
(menos código acidental, melhor composição/testabilidade/concorrência, erros mais explícitos)
for claro e com zero regressão local-first.

---

## Marcos

- **M1 — Fundação decidida:** ADR-0001 (PGlite + kysely/Drizzle) escrito. *(fim Fase 0)*
- **M2 — Tracer bullet:** `legislacao` em PGlite, check verde. *(fim Fase 1)* → destrava spike #4.
- **M3 — Tudo migrado:** 12 módulos em PGlite. *(fim Fase 3)*
- **M4 — SQLite morto:** `bun:sqlite` removido, docs atualizadas. *(fim Fase 4)*
- **M5 — Produto local-first:** ≥1 tool de inteligência (#3) entregue sobre PGlite.
- **M6 — Extensões:** matriz de extensões + ≥1 em produção (ex: `pg_trgm`/`unaccent`). *(Fase 5)*
