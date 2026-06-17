# dados-publicos-mcp

Local-first MCP server that indexes Brazilian public data (procurement, legislation, suppliers) into **one local PGlite database** and serves it over stdio. Fully **Effect v4 native** — errors are values; the style is **declarative** (data + combinators, not glue functions). Code is **English**; only user-facing error strings are pt-BR.

The server exposes **85 MCP tools** (67 query + 12 index + `status_indices` + 5 `guia_*` skills) over **21 source slices** folded from data via `defineTool`. The `guia_*` tools (`src/serve/skills.ts`) take no input and return a markdown composition recipe for the agent to ingest; `foldExit` renders string results as raw text. Storage is a single PGlite database (`src/kernel/db/`) at the configured data dir, with four extensions — **`vector`** (pgvector), **`pg_textsearch`** (BM25), **`ltree`**, **`pg_trgm`**. Retrieval is hybrid: BM25 ⊕ pgvector fused by **RRF**, plus `pg_trgm` fuzzy matching and `ltree` hierarchies. The CLI (`src/index.ts`) is `effect/unstable/cli` + `@effect/platform-bun`; `index` (re)builds a source, no subcommand starts `serve`. Indexes persist via `DADOS_PUBLICOS_MCP_DATA_DIR` (Config-driven, XDG/platform default fallback).

## Language

**Source**:
A Brazilian public-data origin (PNCP, Receita, Planalto, IBGE, TSE...). Each Source is a self-contained folder under `sources/` that exposes a `Layer`.
_Avoid_: module, slice, provider, fonte.

**Index**:
The local, queryable copy of a Source, built by the Indexer and persisted by the Store into the shared PGlite database (its own tables under `src/kernel/db/schemas/`).
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
The static catalog of a Source (list of norms, CNAE codes...). File `data.ts`.
_Avoid_: catalog (clashes with the **errors** catalog), seed, fixtures.

**Privacy envelope**:
The local-first guarantee every Tool upholds: nothing the user queries leaves the machine — the index is local, embeddings are computed locally, no telemetry. (Synthesis Tools that cross several Indexes may attach `sources` / `limitations` / `confidence` to their result.)
_Avoid_: response wrapper, metadata.

## Architecture conventions

Declarative style and folder layout (folder = module = seam; the anti-`utils` rule; naming) live in **[ADR-0002](docs/adr/0002-declarative-architecture-and-folders.md)**. The stack (Effect v4 + PGlite) lives in **[ADR-0001](docs/adr/0001-effect-pglite.md)**.

## Example dialogue

— "Is the Tool `verificar_sancoes` a Query?"
— "The Tool *calls* a Query over the sanctions Index. Where logic crosses Indexes (Receita + sanctions + SICAF), the crossing lives in a Query; the Tool only declares `name` + `schema` + `handler`, and `defineTool` folds it into the server."
— "And the CNAE catalog?"
— "That's **Data** (`data.ts`) if static, or the Index itself if it comes from indexing. We reserve 'catalog' for the **errors** one."
