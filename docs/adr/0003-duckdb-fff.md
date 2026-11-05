# ADR-0003 — DuckDB + fff, no SQL server, no embeddings

Supersedes ADR-0001 (Effect + PGlite).

## Decision

- **Tabular data → one native DuckDB file** (`<dataDir>/dados.duckdb`) behind the kernel `Duck` service
  (`src/kernel/duck/duck.ts`). Every source declares its `DuckTable`s (`name`, `key`, typed `columns`, `search`
  columns). Loads go through NDJSON staging (`create`/`append`/`replace`) or DuckDB `read_csv`. Text search is
  the DuckDB `fts` extension (bm25, portuguese stemmer, accents/case folded). Aggregations are plain DuckDB SQL.
- **Typos → fff fuzzy**. When bm25 finds nothing, the store asks the kernel `Fuzzy` service
  (`src/kernel/search/fuzzy.ts`): at index time each searchable table writes `id<TAB>text` lines, fff fuzzy-greps
  them and returns ids, DuckDB returns the rows.
- **Law and case law → Markdown corpora searched by fff**. `minutei-ai/leis` and `minutei-ai/precedentes` are
  shallow git clones (`CorpusGit`) under `<dataDir>/acervos/`; the `Search` service greps, fuzzy-finds and reads them.
  No database copy.
- **No embeddings, no vector search.** Synonym recall is lost; typo recall comes from fff.
- **Alchemy versions every index.** `Mcp.LocalIndex` re-indexes when the scope, the declared tables' hash
  (`infra/schema-hash.ts`) or the source's remote version (git HEAD for corpora) changes.

## Why

PGlite + four extensions + a 470MB embedding model was the largest part of the install and the codebase
(socket server, codecs, DDL generator, 33 drizzle schemas). SQLite as a middle step still meant three engines.
DuckDB alone covers storage, search and analytics; fff covers fuzzy and file search; both ship prebuilt
binaries for Linux, macOS and Windows (x64/arm64). DuckLake was tried and rejected: its tables cannot carry an
fts index.

## Consequences

- One file to back up or delete. The fts extension downloads once into `<dataDir>/duckdb-extensions`.
- Point lookups are milliseconds instead of microseconds — irrelevant for MCP tools.
- Two-letter transpositions (`terraplanagen`) are still missed by fuzzy; that is accepted.
