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
bun run check                         # typecheck + lint estático + testes unitários
bun run test:integration              # testes de integração
```

## Padrões do projeto

- Código em inglês.
- Texto para usuário pode ser em português.
- Sem secrets, tokens ou chaves de API.
- Sem chamadas online em tools de consulta: consulta é local após indexação.
- Erros são dados tipados com `Schema.TaggedErrorClass` e `Effect.fail`.
- Serviços usam `Context.Service` + `Layer.effect`.
- Fan-out externo deve ter concorrência limitada.
- Queries com `LIMIT` precisam de ordenação determinística.

## Adicionando uma fonte

Uma fonte deve ser uma fatia vertical:

```text
src/sources/<fonte>/catalog.ts
src/sources/<fonte>/indexer.ts
src/sources/<fonte>/store.ts
src/kernel/db/schemas/<tabela>.ts
```

Também atualize:

- `src/kernel/db/relations.ts`, se houver relação nova;
- `src/runtime.ts`;
- `src/serve/tools/<fonte>.ts`;
- `src/serve/registry.ts`;
- `src/serve/index-registry.ts`;
- `src/serve/status.ts`.

## Testes

- Unitários ficam em `tests/unit/*.unit.test.ts`.
- Integração fica em `tests/integration/*.integration.test.ts`.
- Não dependa de rede pública em testes.
- Prefira banco PGlite efêmero em teste.

## PR bom

Inclua:

- o que mudou;
- por que mudou;
- fontes públicas usadas, se houver;
- comando de teste executado;
- limitações conhecidas.

## Licença

Contribuições entram sob AGPL-3.0-only.
