# dados-publicos-mcp

Local-first MCP server that indexes Brazilian public data (procurement, suppliers, public spending, law and case law) on the user's machine and serves it over stdio. Fully **Effect v4 native** — errors are values; the style is **declarative** (data + combinators, not glue functions). Code is **English**; only user-facing strings are pt-BR.

Tabular sources live in **one DuckDB file** (bm25 text search + SQL analytics), typo-tolerant lookups fall back to **fff fuzzy**, and the law/case-law corpora (`minutei-ai/leis`, `minutei-ai/precedentes`) are Markdown clones searched directly by **fff**.

## Language

**Source**:
A Brazilian public-data origin (PNCP, Receita, Planalto, IBGE, TSE...). Each Source is a self-contained folder under `sources/` that exposes a `Layer`.
_Avoid_: module, slice, provider, fonte.

**Corpus** (acervo):
A git-cloned Markdown collection (laws, precedents) searched in place by fff — never copied into DuckDB.
_Avoid_: dataset, dump.

**Index**:
The local, queryable copy of a Source, built by the Indexer and persisted by the Store into the shared DuckDB file (its own `DuckTable`s, declared in the source).
_Avoid_: cache, dump, database.

**Indexer**:
What downloads + parses + writes a Source into an Index. Implements `build`/`status`.
_Avoid_: builder, crawler, importer.

**Query**:
A read with real logic over an Index (search, join, aggregation). Exists only where there is logic — trivial reads talk to the Store directly.
_Avoid_: service, query handler, repository.

**Tool**:
An MCP tool exposed to the agent. Declared as data (`{ schema, handler }`), never as a registration function with `if/else`.
_Avoid_: endpoint, command, action.

**Data** (domain):
The static catalog of a Source (CNAE levels, code tables...). Lives in the source's `catalog.ts`.
_Avoid_: seed, fixtures.

**Privacy envelope**:
The local-first guarantee every Tool upholds: nothing the user queries leaves the machine — the index is local, search runs locally, no telemetry. (Synthesis Tools that cross several Indexes may attach `sources` / `limitations` / `confidence` to their result.)
_Avoid_: response wrapper, metadata.

## Architecture conventions

Declarative style: declared data + combinators over glue functions. Folders are named for a capability (`duck`, `search`, `csv`, `http`); no `utils`/`helpers`/`common`. Layout and import directions are enforced by the lint.

## Example dialogue

— "Is the Tool `verificar_sancoes` a Query?"
— "The Tool *calls* a Query over the sanctions Index. Where logic crosses Indexes (Receita + sanctions + SICAF), the crossing lives in a Query; the Tool only declares `name` + `schema` + `handler`, and `defineTool` folds it into the server."
— "And the CNAE catalog?"
— "That's **Data** in `cnae/catalog.ts` if static, or the Index itself if it comes from indexing."
