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
| `pncp` | pesada | Contratações, contratos, atas, itens por contratação e instrumentos de cobrança do PNCP. |
| `siconfi-fiscal` | pesada | Dados fiscais SICONFI. |
| `transferegov` | pesada | Convênios e transferências. |
| `painel-precos` | pesada | Preços praticados em compras públicas. |
| `transparencia-despesas` | pesada | Despesas federais. |
| `portal-transparencia` | leve | PEP, CPGF e emendas; último período disponível, ou `--mes YYYY-MM`. |
| `servidores-siape` | pesada | Cadastro SIAPE, com CPF mascarado; arquivos de remuneração não são indexados. |
| `mte-lista-suja` | leve | Cadastro oficial de empregadores do MTE; HTTP 403 é informado como bloqueio, sem espelho defasado. |
| `ibama` | pesada | Autos e embargos SIFISC; CPF mascarado antes da gravação, registros com `SIT_CANCELADO=S` excluídos. |
| `compras-gov` | pesada | SIASG/Comprasnet, itens/resultados, contratos, ARP, fornecedores, UASG/órgão e PCA. Exige `--mes` e `--orgaos`; `--uasgs` restringe unidades. |
| `tce-rs` | pesada | LicitaCon anual: 24 tabelas de licitações, contratos, itens, propostas, participantes e documentos; `--anos 2025,2026`, até cinco anos. |
| `tce-pr` | pesada | Mural de Licitações anual; `--anos 2025,2026`, até cinco anos. Cabeçalho validado, CPF mascarado, campos oficiais preservados. |
| `bndes` | leve | Operações não automáticas e com entes públicos, descobertas pelo CKAN; sem indiretas automáticas. O arquivo de entes não tem CNPJ. |
| `cvm` | leve | Companhias, fundos e processos sancionadores. Processos e acusados se vinculam por NUP; o ZIP sancionador não publica CNPJ de acusados. |
| `pgfn` | leve | Dívida ativa Previdenciária e FGTS; CPF mascarado e CNPJ completo. |
| `pgfn-nao-previdenciario` | pesada | Dívida ativa Não-Previdenciária, separada da carga leve. |
| `sinapi` | pesada | Insumos e custos SINAPI. |
| `indices-reajuste` | leve | Taxas mensais SGS/BCB (IPCA, INPC, IGP-M, IGP-DI, INCC-M, IPCA-15), últimos seis anos-calendário; IPCA número-índice SIDRA, últimas 120 observações. |

A tool `buscar` indexa fontes leves vazias automaticamente. Para SQL, descubra a disponibilidade em `fontes` e use `indexar` antes de consultar uma fonte vazia (ou execute `bun run index`). Fontes pesadas só pela CLI: `index <fonte>` ou `--include-heavy`.

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
bun src/index.ts index compras-gov --mes 2026-01 --orgaos 26000
bun src/index.ts index tce-rs --anos 2025,2026
```

Indexar tudo, incluindo fontes pesadas:

```bash
bun src/index.ts index --include-heavy
```

Checar qualidade antes de contribuir:

```bash
bun run check
```

## Recortes e cobertura

Compras.gov.br: `bun src/index.ts index compras-gov --mes 2026-01 --orgaos 26000`. O recorte admite até 10 órgãos, 50 UASGs, 200 páginas por endpoint e 2000 requisições no total, com concorrência máxima de 2. Exceder esses limites aborta a carga antes de substituir os índices. PCA usa o ano do mês informado; os demais recortes respeitam as datas de cada endpoint (publicação, homologação ou início de vigência). Os campos publicados são preservados nas tabelas `compras_*`, acompanhados de `__id`, `__fonte` e `__busca`.

PNCP: a carga inclui itens por contratação e instrumentos de cobrança por inclusão. As janelas são convertidas para `yyyyMMdd`, e a consulta de cobrança usa no máximo 100 registros por página. `valorUnitarioEstimado` em `pncp_item` é estimativa; não equivale a preço homologado. Instrumentos de cobrança não comprovam pagamento.

TCE-RS: as tabelas `tce_rs_licitacao_*` e `tce_rs_contrato_*` preservam os campos nativos e acrescentam `__id`, `__ano`, `__fonte` e `__busca`. Documentos de pessoas físicas são mascarados antes da gravação. Cabeçalhos e conjunto de arquivos são validados; divergência aborta a transação. Use as chaves nativas de órgão, modalidade, licitação, contrato e ano para os vínculos; `__id` identifica somente a linha local.

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

- `fontes`: fontes, disponibilidade, volume, tabelas, tipos e campos de busca;
- `consultar_sql({ sql, limite? })`: SELECT/WITH local, somente leitura, com acesso externo desabilitado, prazo de 5 segundos e até 1000 linhas (padrão 200);
- `buscar({ tabela, termo, limite? })`: bm25 com fallback fuzzy nas tabelas pesquisáveis;
- `acervo_buscar`, `acervo_localizar`, `acervo_ler`: recebem `acervo: "leis" | "precedentes"`;
- `indexar({ fonte, escopo? })`: indexação de fontes leves; fontes pesadas exigem CLI;
- `guia({ tema })`: uso, juridico, pesquisa_preco, score_orgao, analise_cnpj, mapa_mercado ou reajuste_contrato.

Comece por `fontes` e confira colunas e cobertura antes de compor consultas SQL. As receitas são análises preliminares com fontes, limitações e confiança explícitas.

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
