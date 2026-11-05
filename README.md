# dados-publicos-mcp

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![MCP: stdio](https://img.shields.io/badge/MCP-stdio-green.svg)](https://modelcontextprotocol.io)

Servidor MCP local-first para consultar legislação, jurisprudência, compras públicas e dados públicos brasileiros.

Ele baixa fontes públicas, indexa num arquivo DuckDB local, clona os acervos de leis e precedentes em Markdown e expõe tools MCP via stdio. Depois da indexação, as consultas rodam na máquina do usuário: sem chave de API, sem banco externo, sem scraping em tempo de resposta.

## Para que serve

- Buscar e ler leis e precedentes (súmulas, temas, decisões) em Markdown, com busca textual e por nome de arquivo.
- Resolver município, UF, CNAE, CATMAT e CATSER.
- Triar fornecedor por CNPJ, sanções, SICAF, sócios, contratos e vínculos públicos.
- Cruzar PNCP, Receita, CGU, IBGE, Tesouro, TSE, Câmara, Senado, SICONFI, Transferegov e outras bases públicas.
- Dar a agentes MCP uma base local, auditável e reproduzível para licitações e due diligence.

## Fontes

| Fonte | Peso | Conteúdo |
| --- | --- | --- |
| `leis` | pesada | Acervo [minutei-ai/leis](https://github.com/minutei-ai/leis): ~230 mil normas federais, estaduais e municipais em Markdown (clone git). |
| `precedentes` | leve | Acervo [minutei-ai/precedentes](https://github.com/minutei-ai/precedentes): súmulas, temas e decisões em Markdown (clone git). |
| `ibge-localidades` | leve | UFs e municípios. |
| `cnae` | leve | CNAE 2.0. |
| `catmat-catser` | leve | Catálogo de materiais e serviços. |
| `sicaf-fornecedores` | leve | Fornecedores SICAF. |
| `sancoes-cgu` | leve | CEIS, CNEP, CEPIM, CEAF e leniência. |
| `capag` | leve | CAPAG e entes SICONFI. |
| `tcu-inidoneos` | leve | Empresas inidôneas e suspensas do TCU. |
| `ibge-economia` | leve | Indicadores econômicos municipais. |
| `senado` | leve | Senadores e cota parlamentar (CEAPS). |
| `cmed-anvisa` | leve | Preços de medicamentos CMED. |
| `receita-cnpj` | pesada | Empresas, estabelecimentos, sócios e Simples. |
| `tse-eleitoral` | pesada | Candidatos, bens, receitas e despesas eleitorais. |
| `camara-deputados` | pesada | Deputados, cota parlamentar e proposições. |
| `querido-diario` | pesada | Diários oficiais municipais. |
| `pncp` | pesada | Contratações, contratos e atas do PNCP. |
| `siconfi-fiscal` | pesada | Dados fiscais SICONFI. |
| `transferegov` | pesada | Convênios e transferências. |
| `painel-precos` | pesada | Preços praticados em compras públicas. |
| `transparencia-despesas` | pesada | Despesas federais. |
| `sinapi` | pesada | Insumos e custos SINAPI. |

Fontes leves indexam sozinhas na primeira consulta (ou via `bun run index` / tool `indexar`). Fontes pesadas só pela CLI: `index <fonte>` ou `--include-heavy`.

## Instalação

```bash
bun install
```

Requisitos: Bun 1.3+ e git (para os acervos). Linux, macOS ou Windows, x64 ou arm64.

## Uso

Tudo fica no diretório de dados (`DADOS_PUBLICOS_MCP_DATA_DIR`, ou `~/.local/share/dados-publicos-mcp`): um arquivo
`dados.duckdb`, os acervos em `acervos/` e os índices aproximados em `fuzzy/`. O Alchemy versiona cada índice e só
reindexa quando a fonte, o escopo ou o formato das tabelas mudou.

Indexar as fontes leves:

```bash
bun run index
```

Rodar o servidor MCP por stdio:

```bash
bun run start
```

Indexar uma fonte específica:

```bash
bun src/index.ts index leis
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

- consultas por fonte (`buscar_*`, `resolver_*`, `consultar_cnpj`, ...);
- acervos: `buscar_leis`, `localizar_leis`, `ler_leis` e o mesmo para `precedentes`;
- `perfil_fornecedor(cnpj)`: Receita, sanções CGU, TCU e SICAF numa chamada;
- `indexar({ fonte })` para fontes leves e `status_indices`;
- guias (`guia_*`) com receitas de composição para agentes.

Use `status_indices` para ver o que já está indexado localmente.

## Arquitetura curta

- Runtime: Bun + TypeScript + Effect v4.
- Dados tabulares: um arquivo DuckDB local, busca bm25 (extensão `fts`, português, sem acento).
- Erros de digitação: fallback com fff fuzzy.
- Leis e precedentes: clones git em Markdown, buscados direto com fff.
- Infra local: Alchemy versiona e reindexa cada fonte.
- Transporte: MCP stdio. Privacidade: dados públicos, processamento local, zero secrets.

## Contribuição

Veja [CONTRIBUTING.md](./CONTRIBUTING.md).

## Licença

AGPL-3.0-only.
