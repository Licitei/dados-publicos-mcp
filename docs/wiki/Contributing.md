# Contribuição

Veja também [`CONTRIBUTING.md`](../../CONTRIBUTING.md).

## Gate local

```bash
bun run check
```

Esse comando roda typecheck, lint estático e testes unitários.

## Regras curtas

- Use Bun.
- Não adicione secrets.
- Mantenha consultas offline após indexação.
- Prefira mudanças pequenas.
- Teste sem depender de rede pública.
- Código em inglês; mensagens de usuário podem ser em português.

## Fonte nova

Adicione uma fatia vertical:

```text
src/sources/<fonte>/catalog.ts
src/sources/<fonte>/indexer.ts
src/sources/<fonte>/store.ts
src/kernel/db/schemas/<tabela>.ts
```

Depois conecte runtime, registry, status e testes.
