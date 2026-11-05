# AGENTS.md — dados-publicos-mcp

MCP server (AGPL-3.0, **Bun + TypeScript + Effect v4**) that indexes Brazilian public data **locally** and serves
it to MCP clients over stdio. Public data only — zero secrets, zero API keys, nothing the user asks leaves the machine.

## Map

```
src/
  kernel/
    duck/duck.ts        Duck — one native DuckDB file (<dataDir>/dados.duckdb); DuckTable declarations; bm25 fts
    search/search.ts    Search — fff grep / fuzzy file find / read over the Markdown corpora
    search/fuzzy.ts     Fuzzy — fff fuzzy fallback for typos (id<TAB>text files written at index time)
    search/corpus.ts    CorpusGit — shallow clone/pull of minutei-ai/leis and minutei-ai/precedentes
    http/client.ts      Http — the gold standard (classified retry, Schema-decoded JSON, HttpOriginOverride)
    data-dir.ts         DADOS_PUBLICOS_MCP_DATA_DIR via Config, XDG/platform fallback
    csv/ zip/ xlsx/ text/
  sources/<x>/          20 slices: catalog.ts (Schemas, codes, errors, DuckTables) · indexer.ts · store.ts (Service + XLive)
  serve/                MCP tools over the low-level SDK Server
  runtime.ts            ManagedRuntime over AppLayer (20 sources ⊕ Duck ⊕ Http ⊕ Search ⊕ Fuzzy ⊕ CorpusGit)
  index.ts              CLI (effect/cli): no subcommand = serve; `index [<fonte>]`
infra/                  Alchemy: Mcp.LocalIndex per fonte (alchemy.run.ts, local-index*.ts, schema-hash.ts)
tooling/lint/           the lint (oxlint config + dados-publicos plugin + policies + their tests)
tooling/bench/          `bun run bench` — p50/p95 of fff, bm25 and DuckDB lookups on the local data
```

Sources: `ibge-localidades`, `cnae`, `catmat-catser`, `sicaf-fornecedores`, `sancoes-cgu`, `receita-cnpj`,
`tse-eleitoral`, `camara-deputados`, `querido-diario`, `capag`, `pncp`, `tcu-inidoneos`, `ibge-economia`, `senado`,
`cmed-anvisa`, `siconfi-fiscal`, `transferegov`, `painel-precos`, `transparencia-despesas`, `sinapi`; plus the
corpora `leis` and `precedentes`. Heavy ones (`leis`, `receita-cnpj`, `tse-eleitoral`, `camara-deputados`,
`querido-diario`, `pncp`, `siconfi-fiscal`, `transferegov`, `painel-precos`, `transparencia-despesas`, `sinapi`) only
index from the CLI; light ones also index on demand (`indexar` tool, or automatically on first query when empty).

## Commands

```bash
bun install
bun run start                                  # serve over stdio
bun run index                                  # all light sources (Alchemy deploy of Mcp.LocalIndex)
bun src/index.ts index leis                    # one source / corpus
bun src/index.ts index pncp --mes 2026-01      # scoped
bun src/index.ts index --include-heavy
bun run check                                  # THE GATE
bun run format                                 # oxfmt
bun run test:integration                       # Alchemy deploy tests (separate config)
bun run bench
```

## How a source works

- `catalog.ts` declares the upstream Schemas, error codes (`Schema.Literals`), the `Schema.TaggedError` with a pt-BR
  `get message()`, and the `DuckTable`s (`name`, `key`, typed `columns`, `search` columns for bm25).
- `indexer.ts` downloads through `Http`, parses (csv/zip/xlsx kernels), returns rows.
- `store.ts` is a `Context.Service` + exported `Layer.effect`. `index` loads rows with `duck.replace` (or
  `create`/`append`/`reindex` for big loads, all inside `duck.transaction`) and writes the `fuzzy` file for searchable
  names. Search = bm25 first (`bm25(table)`), then `fuzzy.match` → `inIds` when bm25 finds nothing (score 0).
- Register the tables in `serve/index-registry.ts` (`fonteTables`) — Alchemy hashes them to decide re-indexing and
  the lazy indexer uses them to detect an empty source.
- Copy `src/sources/cnae/` when adding a source. The lint tells you everything else.

## Serve

`defineTool({ name, description, input: Schema, run })` (`tool.ts`) → `registry.ts` → `server.ts` (low-level SDK
`Server`, runs against the shared runtime, folds the `Exit` with `fold.ts`). Tools: per-source query tools, the
corpora tools (`buscar_`/`localizar_`/`ler_` × `leis`/`precedentes`), `perfil_fornecedor` (Receita ⊕ sanções ⊕ TCU ⊕
SICAF), one `indexar({ fonte })`, `status_indices`, and the `guia_*` recipes (`skills.ts`). `lazy.ts` wraps light
sources so an empty index is built on first call.

## Infra (Alchemy)

Every index is an `Mcp.LocalIndex` resource. `diff` re-indexes only when the scope, the declared tables' hash
(`infra/schema-hash.ts`) or the source's remote `version` (git HEAD for corpora) changed; sources without a version
re-index on every explicit run. `infra/alchemy.run.ts` declares the light sources; the CLI `index` command deploys
single resources through `infra/local-index.run.ts`.

## Tests

`@effect/vitest`, no mocks: HTTP goes over real TCP to `fixtureLayer(routes)` (`tests/unit/support/fixture-server.ts`),
DuckDB is a real file in a temp dir (`TestDuckLive`), fff runs for real (`TestFuzzyLive`, `TestSearchLive` with a
fixture corpus), zips are real (`stored-zip.ts`). Suites use `layer(TestLayer, { excludeTestServices: true })`.
The DuckDB `fts` extension downloads once into the shared data dir.

## Pointers

`docs/adr/0002-declarative-architecture-and-folders.md`, `docs/adr/0003-duckdb-fff.md`, `CONTEXT.md` (vocabulary).
Published artifacts: `src/` + `README.md` + `LICENSE` (AGPL-3.0-only).
