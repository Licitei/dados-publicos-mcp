# Contribuindo

Obrigado por melhorar o `dados-publicos-mcp`.

## Antes de começar

```bash
bun install
bun run check
```

Use Bun. Não use npm, yarn ou pnpm neste repositório.

## Fluxo

1. Crie uma branch curta a partir de `main`.
2. Faça mudanças pequenas e revisáveis.
3. Rode `bun run check`.
4. Abra PR explicando o problema, a solução e como testou.

## Comandos úteis

```bash
bun run start                         # servidor MCP via stdio
bun run index                         # indexa fontes leves
bun src/index.ts index <fonte>        # indexa uma fonte
bun src/index.ts index --include-heavy
bun run check                         # typecheck + lint + testes unitários
bun run format                        # oxfmt
bun run test:integration              # testes de integração
```

## Padrões do projeto

O lint (`tooling/lint`) é o livro de regras: tudo o que pode ser checado é regra com teste de fixture. Rode
`bun run format` e `bun run check`. Se uma regra estiver errada, corrija a regra e os fixtures dela; não use
comentários de disable. O que o lint não vê:

- Código em inglês; texto para usuário em português.
- Sem secrets, tokens ou chaves de API; consulta é sempre local após indexação.

## Adicionando uma fonte

Copie `src/sources/cnae/`: `catalog.ts` (Schemas, códigos, erro, `DuckTable`s), `indexer.ts` (download + parse) e
`store.ts` (`Context.Service` + `Layer.effect`; `index` com `duck.replace` e `fuzzy.write`; busca bm25 → fuzzy).
Depois registre em `src/runtime.ts`, `src/serve/tools/<fonte>.ts`, `src/serve/registry.ts` e
`src/serve/index-registry.ts` (entrada + `fonteTables`).

## Testes

- Unitários em `tests/unit/*.unit.test.ts`; integração em `tests/integration/*.integration.test.ts`.
- Sem mocks e sem rede pública: `fixtureLayer` (servidor HTTP local), `TestDuckLive` (DuckDB real em pasta
  temporária), `TestFuzzyLive` e `TestSearchLive` (fff real).

## PR bom

Inclua:

- o que mudou;
- por que mudou;
- fontes públicas usadas, se houver;
- comando de teste executado;
- limitações conhecidas.

## Licença

Contribuições entram sob AGPL-3.0-only.
