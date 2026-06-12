# dados-publicos-mcp

MCP server local-first que indexa dados públicos brasileiros (licitações, legislação, fornecedores) em banco local e serve por stdio. Erros são valores; estilo **declarativo** (dado + combinators, não glue functions).

## Language

**Fonte**:
Uma origem de dados públicos brasileira (PNCP, Receita, Planalto, IBGE, TSE...). Cada Fonte é uma pasta autocontida em `fontes/` que expõe um `Layer`.
_Avoid_: módulo, slice, source, provider.

**Índice**:
A cópia local consultável de uma Fonte, construída pelo Indexador e persistida no Store.
_Avoid_: cache, banco, dump.

**Indexador**:
O que baixa + parseia + grava uma Fonte para virar Índice. Implementa `build`/`status`.
_Avoid_: builder, crawler, importer.

**Consulta**:
Leitura com lógica real sobre um Índice (busca, join, agregação). Só existe quando há lógica — leitura trivial fala direto com o Store.
_Avoid_: service, query handler, repository.

**Tool**:
Uma ferramenta MCP exposta ao agente. Declarada como dado (`{ schema, handler }`), nunca como função de registro com `if/else`.
_Avoid_: endpoint, comando, action.

**Dados** (de domínio):
Catálogo estático de uma Fonte (lista de normas, códigos CNAE...). Arquivo `dados.ts`.
_Avoid_: catalog (colide com o catálogo de **erros**), seed, fixtures.

**Envelope de privacidade**:
O contrato `{ privacidade: { modo: "local", dadosEnviadosParaTerceiros: false }, fontes, limitacoes, confianca }` que toda Tool de inteligência (#3) retorna. Módulo `Resposta<T>`.
_Avoid_: response wrapper, metadata.

## Convenções de arquitetura

Estilo declarativo e layout de pastas (pasta = módulo = seam; regra anti-`utils`; naming) estão em **[ADR-0002](docs/adr/0002-arquitetura-declarativa-e-pastas.md)**. Stack (Effect v4 + PGlite) em **[ADR-0001](docs/adr/0001-effect-pglite.md)**.

## Diálogo de exemplo

— "A Tool `triagem_fornecedor_local` é uma Consulta?"
— "A Tool *chama* uma Consulta sobre o Índice da Receita. Mas como cruza Receita + sanções + SICAF, a lógica de cruzamento mora numa Consulta; a Tool só declara `schema` + `handler`."
— "E o catálogo de CNPJs?"
— "Isso é **Dados** (`dados.ts`) se for estático, ou o próprio Índice se vier da indexação. 'Catálogo' a gente reserva pro de **erros**."
