# 0002 — Arquitetura declarativa e layout de pastas

A v2 é **declarativa-first**: declarar dado/schema e compor com combinators do Effect (`Match`, `Layer`, `Schema`, `Effect.catchTags`), nunca escrever glue functions. O layout físico segue **pasta = módulo = seam**: cada pasta expõe uma superfície pública mínima (um `index.ts` com seu `Layer`) e esconde o resto.

## Declarativo, não helpers

O `lint:errors` já bane `to*Error`/`is*Error`/`map*Error`/`wrap*Error`/`from*Error` e funções que retornam erro. Estendemos a estética para todo o código:

- Ramificar/mapear com **`Match.tag(...)`** / **`Effect.catchTags({...})`**, não `switch` dentro de um helper `to*`.
- Tools declaradas como **record** `{ nome: { schema, handler } }`, consumidas por um `defineTool` profundo — não `registerXxxTools` com `if/else` por slice.
- Erros como **`Data.TaggedError`**; composição como **`Layer.mergeAll`**.
- Regra mental: **um módulo profundo declarativo (DSL/kernel) > muitos helpers pequenos.**

## Regra anti-`utils`

Proibido `utils/`, `helpers/`, `misc/`, `common/`. Uma pasta ganha o nome por ser módulo profundo com interface. Se o nome candidato é "util", o conteúdo é: (a) **capacidade** → nomeie (`text`, `parse`, `http`); (b) **domínio** → nomeie (`cnpj`, `periodo`, `pncp/id`); ou (c) **não devia existir** → vira combinator inline (`Array.filter`/`reduce`, `Schema`).

## Layout

```
src/
  main.ts · runtime.ts            # entrypoint fino + AppLayer = mergeAll(fontes)
  kernel/                         # core profundo por capacidade
    mcp/   (tool.ts, server.ts, prompts.ts, resources.ts)
    db/    (client.ts PGlite Layer, drizzle.ts)
    http/  (client.ts, tagged.ts)
    parse/ · text.ts · paths.ts
  domain/  (cnpj.ts, uf.ts, resposta.ts)   # vocabulário compartilhado
  fontes/<fonte>/  index.ts(barrel) tools.ts consulta.ts indexador.ts store.ts erros.ts dados.ts <fonte>.test.ts
```

## Naming fixo (mata o drift atual)

`index.ts` (público) · `consulta.ts` (não `service`) · `store.ts` (não `db`) · `indexador.ts` · `erros.ts` · `dados.ts` (não `catalog`) · `mapper.ts` (não `mappers`/`mapping`) · **kebab-case sempre** (não `dataDir.ts`).

## Status

accepted. Migração de pastas acompanha a migração módulo-a-módulo do roadmap; não é um PR big-bang.
