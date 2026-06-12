# dados-publicos-mcp

Local-first MCP server that indexes Brazilian public data (procurement, legislation, suppliers) into a local database and serves it over stdio. Errors are values; the style is **declarative** (data + combinators, not glue functions). Code is **English**; only user-facing error strings are pt-BR.

## Language

**Source**:
A Brazilian public-data origin (PNCP, Receita, Planalto, IBGE, TSE...). Each Source is a self-contained folder under `sources/` that exposes a `Layer`.
_Avoid_: module, slice, provider, fonte.

**Index**:
The local, queryable copy of a Source, built by the Indexer and persisted by the Store.
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
The contract `{ privacy: { mode: "local", sentToThirdParties: false }, sources, limitations, confidence }` that every intelligence Tool (#3) returns. Module `Response<T>`.
_Avoid_: response wrapper, metadata.

## Architecture conventions

Declarative style and folder layout (folder = module = seam; the anti-`utils` rule; naming) live in **[ADR-0002](docs/adr/0002-declarative-architecture-and-folders.md)**. The stack (Effect v4 + PGlite) lives in **[ADR-0001](docs/adr/0001-effect-pglite.md)**.

## Example dialogue

— "Is the Tool `triagem_fornecedor_local` a Query?"
— "The Tool *calls* a Query over the Receita Index. Since it crosses Receita + sanctions + SICAF, the crossing logic lives in a Query; the Tool only declares `schema` + `handler`."
— "And the CNPJ catalog?"
— "That's **Data** (`data.ts`) if static, or the Index itself if it comes from indexing. We reserve 'catalog' for the **errors** one."
