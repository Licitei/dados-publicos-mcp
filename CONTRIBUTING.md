# Contribuindo

Obrigado por contribuir com o `dados-publicos-mcp`.

## Ambiente

Este projeto usa **Bun + TypeScript**. Não use npm, yarn ou pnpm.

```bash
bun install
```

## Comandos principais

```bash
bun run start          # MCP server via stdio
bun run index          # constrói índices leves
bun run typecheck      # TypeScript strict
bun run lint:errors    # regras declarativas de erro do projeto
bun run lint:oxc       # Oxlint
bun run format:check   # verifica formatação com Oxfmt
bun test               # testes Bun
bun run check          # gate local: typecheck + lint:errors + test
```

Antes de abrir PR, rode:

```bash
bun run format
bun run lint:oxc
bun run check
```

## Formatação e lint

- `oxfmt` é o formatador padrão.
- `oxlint` é o linter rápido baseado no Oxc.
- O linter declarativo do projeto continua em `bun run lint:errors` e valida regras específicas de tratamento de erro.

## Regras importantes do projeto

- Falhas devem ser valores (`Result<T, EvlogError>`), nunca exceções para fluxo esperado.
- Não use `try/catch` statement-level em `src/`.
- Não chame `db.close()` em módulos; o singleton de SQLite gerencia o ciclo de vida.
- I/O deve ser Bun-native sempre que houver equivalente (`Bun.file`, `Bun.write`, etc.).
- Testes ficam em `__tests__/` e não devem acessar rede pública.

## Pull requests

Inclua no PR:

1. Resumo objetivo da mudança.
2. Comandos de validação executados.
3. Observações sobre dados locais, índices ou migrações, se aplicável.
