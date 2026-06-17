# Arquitetura

## Stack

- Bun + TypeScript.
- Effect para efeitos, erros e camadas.
- PGlite como Postgres local em processo.
- Drizzle para schemas e SQL.
- MCP stdio para transporte.

## Fluxo

```text
fonte pública -> indexer -> PGlite local -> store -> tool MCP -> cliente
```

## Busca

O banco local usa extensões conforme a fonte:

- BM25 para busca textual.
- pgvector para busca semântica.
- trigram para fuzzy matching.
- ltree para hierarquias.

## Organização

```text
src/kernel/     infraestrutura compartilhada
src/sources/    fontes públicas em fatias verticais
src/serve/      tools MCP, registry e servidor stdio
src/runtime.ts  composição das camadas
src/index.ts    CLI
```

Cada fonte concentra catálogo, indexador, store e schemas próprios.
