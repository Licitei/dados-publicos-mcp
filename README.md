# dados-publicos-mcp

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![MCP: stdio](https://img.shields.io/badge/MCP-stdio-green.svg)](https://modelcontextprotocol.io)

Servidor MCP local-first para consultar legislação, compras públicas e dados públicos brasileiros.

Ele baixa fontes oficiais, indexa tudo em um PGlite local e expõe tools MCP via stdio. Depois da indexação, as consultas rodam na máquina do usuário: sem chave de API, sem banco externo, sem scraping em tempo de resposta.

## Para que serve

- Buscar trechos de legislação e artigos específicos.
- Resolver município, UF, CNAE, CATMAT e CATSER.
- Fazer triagem de fornecedor por CNPJ, sanções, SICAF, sócios e contratos.
- Cruzar dados do PNCP, Receita Federal, CGU, TSE, Câmara, IBGE, Tesouro e Querido Diário.
- Dar a agentes MCP uma base local, auditável e reproduzível para licitações e due diligence.

## Fontes

| Fonte | Peso | Conteúdo |
| --- | --- | --- |
| `legislacao` | leve | Normas oficiais e árvore de artigos. |
| `ibge-localidades` | leve | UFs e municípios. |
| `cnae` | leve | CNAE 2.0. |
| `catmat-catser` | leve | Catálogo de materiais e serviços. |
| `sicaf-fornecedores` | leve | Fornecedores SICAF. |
| `sancoes-cgu` | leve | CEIS, CNEP, CEPIM, CEAF e acordos de leniência. |
| `capag` | leve | CAPAG e entes SICONFI. |
| `receita-cnpj` | pesada | Empresas, estabelecimentos, sócios e Simples. |
| `tse-eleitoral` | pesada | Candidatos, bens, receitas e despesas eleitorais. |
| `camara-deputados` | pesada | Deputados, cota parlamentar e proposições. |
| `querido-diario` | pesada | Diários oficiais municipais. |
| `pncp` | pesada | Contratações, contratos e atas do PNCP. |

## Instalação

```bash
bun install
```

Requisitos: Bun 1.1+.

## Uso

Rodar o servidor MCP por stdio:

```bash
bun run start
```

Indexar fontes leves:

```bash
bun run index
```

Indexar uma fonte específica:

```bash
bun src/index.ts index legislacao
bun src/index.ts index pncp --mes 2026-01
bun src/index.ts index querido-diario --ufs SP,RJ --anos 2024,2025
```

Indexar tudo, incluindo fontes pesadas:

```bash
bun src/index.ts index --include-heavy
```

Checar qualidade antes de contribuir:

```bash
bun run check
```

## Configuração MCP

Exemplo para clientes que aceitam comando local:

```json
{
  "mcpServers": {
    "dados-publicos-mcp": {
      "command": "bun",
      "args": ["/caminho/para/dados-publicos-mcp/src/index.ts"]
    }
  }
}
```

## Tools

O servidor expõe 58 tools:

- 44 consultas;
- 8 indexadores;
- 1 status (`status_indices`);
- 5 guias (`guia_*`) com receitas de composição para agentes.

Principais grupos:

- Legislação: `buscar_legislacao`, `obter_artigo`, `listar_normas`.
- Localidades e classificações: IBGE, CNAE, CATMAT/CATSER.
- Fornecedores: Receita, CGU, SICAF, sócios e sanções.
- Compras públicas: PNCP, Câmara, CAPAG, Querido Diário.
- Eleitoral: doações, fornecedores de campanha, candidatos e bens.

Use `status_indices` para ver o que já está indexado localmente.

## Arquitetura curta

- Runtime: Bun + TypeScript + Effect.
- Banco: PGlite local com Drizzle.
- Busca: BM25, pgvector, trigram e ltree.
- Transporte: MCP stdio.
- Privacidade: dados públicos, processamento local, zero secrets.

## Contribuição

Veja [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licença

AGPL-3.0-only.
