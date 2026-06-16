# dados-publicos-mcp

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![MCP](https://img.shields.io/badge/MCP-stdio-green.svg)](https://modelcontextprotocol.io)

Servidor MCP da Licitei para consulta de dados publicos brasileiros usados em
licitacoes, contratos administrativos, compras publicas e due diligence de
fornecedores e orgaos.

O servidor e **offline-first**. Cada fonte oficial e baixada uma vez, normalizada
e gravada em um unico banco **PGlite** (Postgres embarcado, rodando em processo)
na maquina do usuario. Depois da indexacao, toda consulta — legislacao, CNPJ,
sancoes, socios, diarios, contratos do PNCP — roda local, sem chamada de rede,
sem chave de API e sem banco de terceiros.

Nao ha camada online de tempo real, nem scraping em tempo de resposta. Toda a
inteligencia de busca (texto completo, semantica, fuzzy, hierarquia) vive dentro
do PGlite, sobre quatro extensoes nativas: `vector` (pgvector), `pg_textsearch`
(BM25), `ltree` e `pg_trgm`.

## O que resolve

Agentes que trabalham com licitacoes precisam citar a base legal e cruzar dados
cadastrais com rapidez e previsibilidade. Busca aberta na web e scraping em tempo
de resposta sao lentos, ruidosos e pouco auditaveis.

Este servidor reune, num so banco local:

- fontes oficiais (Planalto, PNCP, Receita Federal, CGU, IBGE, Tesouro, TSE,
  Camara, Querido Diario, Compras.gov.br);
- busca hibrida de verdade: BM25 + pgvector combinados por RRF, mais `pg_trgm`
  para fuzzy e `ltree` para hierarquias;
- 53 tools MCP pequenas e previsiveis, agrupadas por dominio;
- erros declarativos tipados (`Schema.TaggedErrorClass`), serializados no boundary
  MCP, sem exception solta cruzando a fronteira.

Exemplos de perguntas que um agente pode responder usando este MCP:

- "O que a Lei 14.133 fala sobre habilitacao tecnica?"
- "Traga o art. 67 da nova lei de licitacoes."
- "O CNPJ 00.000.000/0001-91 tem alguma sancao ativa (CEIS/CNEP)?"
- "Quais empresas tem o socio Fulano de Tal?"
- "Esses dois fornecedores tem socio em comum?"
- "Qual a nota CAPAG (saude fiscal) da prefeitura que abriu este edital?"
- "Qual o codigo IBGE de Campinas para filtrar licitacoes por municipio?"
- "Procure 'pregao notebook' nos diarios oficiais de SP."

## Escopo

O servidor indexa localmente doze fontes publicas e expoe consultas sobre elas.
A indexacao roda client-side (na maquina de quem roda o MCP). Nao ha banco proprio
compartilhado, matching proprietario, scoring de fornecedores, analise de
viabilidade nem geracao de propostas. As tools entregam dado bruto estruturado
para o agente raciocinar, e a decisao continua humana.

| Fonte (`key`) | Download pesado | Conteudo |
| --- | --- | --- |
| `legislacao` | nao | Normas oficiais do Planalto (catalogo + arvore de artigos). |
| `ibge-localidades` | nao | UFs e municipios do IBGE (codigos e nomes). |
| `cnae` | nao | Tabela CNAE 2.0 (secoes a subclasses). |
| `catmat-catser` | nao | Catalogo de materiais (CATMAT) e servicos (CATSER). |
| `sicaf-fornecedores` | nao | Fornecedores SICAF (busca por nome / UF / CNAE). |
| `sancoes-cgu` | nao | Sancoes (CEIS, CNEP, CEPIM, CEAF, Leniencia) da CGU. |
| `capag` | nao | Capacidade de pagamento de entes (Tesouro / SICONFI). |
| `receita-cnpj` | **sim** | Base de CNPJ da Receita Federal (empresas, socios, Simples). |
| `tse-eleitoral` | **sim** | Doacoes, fornecedores de campanha, candidaturas e bens (TSE). |
| `camara-deputados` | **sim** | Deputados, cota parlamentar (CEAP) e proposicoes. |
| `querido-diario` | **sim** | Diarios oficiais municipais (Querido Diario). |
| `pncp` | **sim** | Indice local do PNCP (contratacoes, contratos, atas). |

As fontes marcadas com download pesado nao sao baixadas por padrao: rode
`index <fonte>` ou `index --include-heavy`.

## Ferramentas MCP

São **53 tools**: 44 de consulta, 8 de indexacao e 1 de status. Todas
retornam JSON. As descricoes abaixo sao as expostas ao cliente MCP.

### Legislacao

| Tool | O que faz |
| --- | --- |
| `buscar_legislacao` | Busca um termo no indice local de legislacao brasileira. |
| `obter_artigo` | Retorna um artigo especifico de uma norma brasileira. |
| `listar_normas` | Lista as normas brasileiras disponiveis no catalogo. |

### Localidades e classificacoes

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `resolver_municipio` | `ibge-localidades` | Resolve o nome de um municipio (UF opcional para desambiguar homonimos) para o codigo IBGE de 7 digitos exigido pelo filtro `codigoMunicipioIbge` do PNCP. |
| `resolver_codigo_ibge` | `ibge-localidades` | Resolucao reversa: recebe o codigo IBGE de 7 digitos e retorna nome do municipio, UF, mesorregiao e regiao. |
| `listar_municipios_uf` | `ibge-localidades` | Lista todos os municipios de uma UF com seus codigos IBGE de 7 digitos. |
| `validar_uf` | `ibge-localidades` | Normaliza/valida uma sigla de UF (ex SP, rj) e retorna o codigo numerico IBGE da UF. |
| `resolver_cnae` | `cnae` | Resolve um codigo de subclasse CNAE (7 digitos, com ou sem mascara, ex 4929-9/02) para a descricao oficial e a hierarquia completa. |
| `buscar_cnae` | `cnae` | Busca subclasses CNAE por palavra-chave na descricao e nas atividades economicas. |
| `listar_cnaes_por_nivel` | `cnae` | Lista as subclasses descendentes de um codigo de secao (A-U), divisao (2d), grupo (3d) ou classe (5d). |

### Catalogo de itens

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_material` | `catmat-catser` | Busca materiais do CATMAT por nome/descricao (FTS local sobre `descricaoItem`). |
| `buscar_servico` | `catmat-catser` | Busca servicos do CATSER por nome (FTS local sobre `nomeServico`). |
| `resolver_catmat_catser` | `catmat-catser` | Resolve um `codigoItem` (CATMAT) ou `codigoServico` (CATSER) para descricao e hierarquia. |
| `normalizar_item_edital` | `catmat-catser` | Recebe uma descricao livre de item de edital e devolve os CATMAT/CATSER mais provaveis (FTS) para deduplicar e casar com PNCP. |

### Due diligence de fornecedor

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `verificar_sancoes` | `sancoes-cgu` | Verifica se um CNPJ ou CPF esta sancionado/inidoneo, cruzando CEIS+CNEP+CEPIM+CEAF+Leniencia numa unica consulta. |
| `buscar_sancionado_por_nome` | `sancoes-cgu` | Busca sancionados (empresa ou pessoa) por nome / razao social nas 5 listas, usando indice de texto (FTS). |
| `sancoes_vigentes_na_data` | `sancoes-cgu` | Lista sancoes ativas numa data (intervalo data inicio/final) - due diligence na data do certame. |
| `consultar_cnpj` | `receita-cnpj` | Consulta um CNPJ completo (14 digitos) no indice local da Receita Federal. Offline, sem rate limit. |
| `buscar_empresa_por_nome` | `receita-cnpj` | Busca empresas por razao social ou nome fantasia (FTS). |
| `buscar_socio_por_nome` | `receita-cnpj` | Busca socios por nome (QSA) e lista todas as empresas em que aparece. Opcionalmente filtra pelos 6 digitos visiveis do CPF mascarado. |
| `socios_em_comum` | `receita-cnpj` | Recebe dois ou mais CNPJs e retorna os socios compartilhados (deteccao de conluio/laranjas em licitacoes). |
| `filtrar_empresas` | `receita-cnpj` | Filtra empresas por CNAE, UF, municipio (codigo RFB), porte (ME/EPP) e situacao cadastral. |
| `buscar_fornecedor_sicaf` | `sicaf-fornecedores` | Busca fornecedores do SICAF por nome / razao social (full-text). |
| `fornecedor_habilitado` | `sicaf-fornecedores` | Verifica por CNPJ se um fornecedor esta ativo e habilitado a licitar no SICAF, offline. |
| `listar_fornecedores_uf_cnae` | `sicaf-fornecedores` | Lista/segmenta fornecedores do SICAF por UF, municipio e/ou CNAE. |

### Risco do orgao comprador

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `capag_ente` | `capag` | CAPAG de um ente: por codigo IBGE (7d) ou nome+UF (municipio) ou sigla UF (estado). Retorna nota CAPAG e os 3 indicadores. |
| `entes_por_nota` | `capag` | Lista entes (estados e/ou municipios) com nota CAPAG informada (ex C/D = alto risco), filtrando por UF/regiao. |
| `capag_serie_historica` | `capag` | Serie historica da nota CAPAG de um ente ao longo dos anos. |
| `resolver_ente_por_cnpj` | `capag` | CNPJ do orgao contratante -> `cod_ibge`/municipio/UF via tabela `/entes` do SICONFI, anexando a CAPAG do ente. |

### Conexoes politicas

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_doacoes` | `tse-eleitoral` | Busca doacoes/receitas eleitorais por CPF/CNPJ ou nome do doador. Fonte: TSE (CC-BY). |
| `buscar_fornecedor_campanha` | `tse-eleitoral` | Busca fornecedores de campanha (despesas contratadas) por CPF/CNPJ ou nome. Fonte: TSE (CC-BY). |
| `rastrear_doador_originario` | `tse-eleitoral` | Rastreia a cadeia de doacao via doador originario (CPF/CNPJ). Fonte: TSE (CC-BY). |
| `due_diligence_candidato` | `tse-eleitoral` | Due diligence de candidato por CPF ou `SQ_CANDIDATO`: candidatura(s) e bens declarados. Fonte: TSE (CC-BY). |
| `fornecedor_cota_parlamentar` | `camara-deputados` | Reverse-lookup: dado um CNPJ/CPF de fornecedor, lista todos os deputados que lhe pagaram via cota parlamentar (CEAP) e a soma de `vlrLiquido`. |
| `gastos_por_fornecedor` | `camara-deputados` | Agrega gastos de cota parlamentar (CEAP) por fornecedor, com filtros opcionais por nome (FTS), CNPJ/CPF, ano e categoria. |
| `buscar_deputado` | `camara-deputados` | Busca deputado por nome ou nome civil (normalizado, sem acento), por id ou por UF de nascimento. |
| `buscar_proposicao` | `camara-deputados` | Busca proposicoes por palavra-chave em ementa, ementa detalhada e keywords (FTS), com filtros opcionais por ano e tipo. Pode incluir autores. |

### Diarios oficiais

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_diarios` | `querido-diario` | Busca full-text no texto extraido dos diarios oficiais municipais (Querido Diario). Filtros opcionais: `territoryId` (IBGE). |
| `buscar_cnpj_em_diario` | `querido-diario` | Busca diarios oficiais municipais que mencionam um CNPJ no corpo de editais e contratos. |
| `diarios_por_municipio` | `querido-diario` | Lista diarios oficiais de um municipio pelo codigo IBGE (`territory_id`). |

### PNCP local

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_pncp_local` | `pncp` | Busca full-text (FTS) no `objetoCompra`/`objetoContrato`/`objetoContratacao` em TODO o indice local do PNCP. |
| `fornecedor_pncp_por_nome` | `pncp` | Busca fornecedores por NOME/razao social (FTS) no indice local de contratos PNCP, com total de contratos e valor. |
| `contratos_do_fornecedor` | `pncp` | Lista todos os contratos de um fornecedor por `niFornecedor` (CNPJ/CPF) em todo o historico local. |
| `alertas_pncp` | `pncp` | Editais (contratacoes) novos, opcionalmente em UF Y, atualizados desde uma data. |

### Indexacao (reconstroi o indice local)

| Tool | O que faz |
| --- | --- |
| `indexar_legislacao` | Baixa fontes oficiais do Planalto e recria o indice local neste computador. |
| `indexar_ibge_localidades` | Baixa a lista de municipios do IBGE e recria o indice local de localidades neste computador. |
| `indexar_cnae` | Baixa a tabela CNAE 2.0 do IBGE e recria o indice local neste computador. |
| `indexar_catmat_catser` | Pagina a API Compras.gov.br e recria o indice local CATMAT/CATSER neste computador. |
| `indexar_sicaf_fornecedores` | Baixa o cadastro de fornecedores do Compras.gov.br (SICAF) e recria o indice local neste computador. |
| `indexar_sancoes` | Baixa os snapshots diarios da CGU (CEIS/CNEP/CEAF/CEPIM/Acordos) e recria o indice local neste computador. |
| `indexar_capag` | Baixa CAPAG (estados CSV historico + municipios XLSX) e `/entes` do SICONFI e recria o indice local. |
| `indexar_camara` | DOWNLOAD PESADO: baixa os arquivos da Camara (deputados + CEAP por ano, opcionalmente proposicoes) e recria o indice local. |

### Status

| Tool | O que faz |
| --- | --- |
| `status_indices` | Lista o status de todos os indices locais (dominios) do servidor: contagem de registros por tabela de cada fonte. |

> As fontes pesadas sem tool `indexar_*` dedicada (`tse-eleitoral`,
> `querido-diario`, `pncp`) sao reconstruidas pela CLI: `index <fonte>`
> ou `index --include-heavy`.

## O arsenal de busca

Todas as fontes vivem num so banco PGlite. A qualidade da busca vem de quatro
extensoes nativas, combinadas conforme o caso de uso:

- **BM25 (`pg_textsearch`)** — busca de texto completo com ranqueamento BM25.
  E o que alimenta `buscar_legislacao`, `buscar_empresa_por_nome`,
  `buscar_diarios`, `buscar_pncp_local`, `buscar_proposicao` e companhia. Resolve
  o problema das APIs oficiais que so aceitam o numero exato (CNPJ, codigo): aqui
  voce busca por nome.
- **Semantica (`vector` / pgvector)** — embeddings gerados localmente
  (`@huggingface/transformers`, sem chamada de rede) permitem encontrar trechos
  por significado, nao so por palavra exata.
- **Hibrida por RRF** — onde faz sentido (legislacao, diarios, PNCP), os
  resultados de BM25 e de pgvector sao fundidos por **Reciprocal Rank Fusion**:
  o ranking final aproveita tanto o casamento lexical quanto a proximidade
  semantica, sem precisar escolher um ou outro.
- **Fuzzy (`pg_trgm`)** — similaridade por trigramas tolera erro de digitacao,
  abreviacao e variacao de grafia em nomes de empresa, socio e municipio.
- **Hierarquia (`ltree`)** — a arvore de artigos da legislacao e as hierarquias
  CNAE/CATMAT/CATSER sao modeladas como caminhos `ltree`, permitindo navegar
  ascendentes e descendentes (secao -> divisao -> grupo -> classe -> subclasse)
  em uma so consulta.

## Catalogo de normas

| ID | Norma | Temas |
| --- | --- | --- |
| `lei-14133-2021` | Lei 14.133/2021 | licitacoes, contratos, PNCP, habilitacao, pregao |
| `lei-8666-1993` | Lei 8.666/1993 | regime antigo de licitacoes e contratos |
| `lei-13303-2016` | Lei 13.303/2016 | estatais, empresas publicas, sociedades de economia mista |
| `lc-123-2006` | Lei Complementar 123/2006 | ME/EPP, Simples Nacional, tratamento favorecido |
| `decreto-11462-2023` | Decreto 11.462/2023 | sistema de registro de precos, atas, contratacoes |

Cada norma tem `id`, titulo, URL oficial, temas e apelidos. Exemplos de apelidos:
`14133`, `lei de licitacoes`, `lei das estatais`, `lc 123`, `srp`.

## Uso rapido

Requisitos:

- Bun 1.1 ou superior.

Clone, instale dependencias, indexe e suba o servidor:

```bash
git clone https://github.com/Licitei/dados-publicos-mcp.git
cd dados-publicos-mcp
bun install
bun run index
bun start
```

A CLI e construida sobre `effect/unstable/cli` + `@effect/platform-bun`. O
comando-raiz, sem subcomando, inicia o servidor MCP via stdio:

```bash
bun src/index.ts            # inicia o servidor MCP (acao padrao)
bun src/index.ts --help     # ajuda da CLI
bun src/index.ts --version  # versao
```

### Indexacao

O subcomando `index` reconstroi um ou varios indices locais:

```bash
# Sem argumento: indexa TODAS as fontes leves (heavy = false). As pesadas sao
# puladas e listadas no log.
bun src/index.ts index

# Inclui tambem as fontes pesadas (receita-cnpj, tse-eleitoral,
# camara-deputados, querido-diario, pncp).
bun src/index.ts index --include-heavy

# Reconstroi apenas uma fonte (use a key exata da tabela de fontes).
bun src/index.ts index cnae
bun src/index.ts index legislacao
```

Quando uma fonte desconhecida e informada, a CLI lista as keys disponiveis e sai
com codigo 1.

Flags de escopo recortam a indexacao das fontes que as conhecem:

| Flag | Formato | Exemplo | Usada por |
| --- | --- | --- | --- |
| `--ufs` | UFs separadas por virgula | `--ufs SP,RJ` | `querido-diario`, etc. |
| `--anos` | anos separados por virgula | `--anos 2023,2024` | `tse-eleitoral`, `camara-deputados`, etc. |
| `--mes` | `YYYY-MM` | `--mes 2026-01` | `receita-cnpj` |

```bash
bun src/index.ts index querido-diario --ufs SP,RJ
bun src/index.ts index camara-deputados --anos 2023,2024
bun src/index.ts index receita-cnpj --mes 2026-01
```

Para inspecionar o que ja esta construido sem reconstruir nada, use a tool MCP
`status_indices` pelo cliente.

### Depois de publicado no npm

```bash
bunx --bun dados-publicos-mcp index
bunx --bun dados-publicos-mcp
```

## Persistencia

Todo o estado vive num **unico banco PGlite** no diretorio de dados. A variavel
de ambiente `DADOS_PUBLICOS_MCP_DATA_DIR` fixa esse diretorio e os indices
persistem entre execucoes:

```bash
DADOS_PUBLICOS_MCP_DATA_DIR=/caminho/local bun run index
```

Sem a variavel, o diretorio e resolvido para um padrao por plataforma (sempre
com o sufixo `dados-publicos-mcp/`):

- **Linux/macOS**: `$XDG_DATA_HOME/dados-publicos-mcp/` ou
  `~/.local/share/dados-publicos-mcp/`;
- **Windows**: `%LOCALAPPDATA%\dados-publicos-mcp\` (ou `%APPDATA%` /
  `%USERPROFILE%\AppData\Local`).

O diretorio e criado recursivamente no primeiro acesso ao banco. Os arquivos do
PGlite ficam fora do controle de versao e do pacote npm, gerados localmente.

## Configuracao MCP

### Claude Desktop

Edite `claude_desktop_config.json`:

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

Reinicie o Claude completamente depois de salvar.

### Cursor

Crie ou edite `~/.cursor/mcp.json`:

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

### Continue.dev

No `config.json` ou `config.yaml` do Continue:

```json
{
  "mcpServers": [
    {
      "name": "dados-publicos-mcp",
      "command": "bun",
      "args": ["/caminho/para/dados-publicos-mcp/src/index.ts"]
    }
  ]
}
```

### Windows

Use o caminho do projeto com barras invertidas (ou `bun` no `PATH`):

```json
{
  "mcpServers": {
    "dados-publicos-mcp": {
      "command": "bun",
      "args": ["C:\\caminho\\para\\dados-publicos-mcp\\src\\index.ts"]
    }
  }
}
```

Para fixar o diretorio de dados, defina `DADOS_PUBLICOS_MCP_DATA_DIR` no bloco
`env` do servidor.

## Contrato das respostas

Toda tool retorna `content` com um bloco de texto.

- **Sucesso** — o `content` traz o resultado serializado como **texto JSON**
  (pretty-printed). `listar_normas`, por exemplo, devolve a lista diretamente.
- **Erro esperado** — a resposta vem com `isError: true` e o texto e a `message`
  pt-BR do `Schema.TaggedErrorClass` que falhou (ex.: "Indice local nao
  encontrado..."). Nenhuma exception cruza o boundary MCP.
- **Parametros invalidos** — quando o input nao casa com o `Schema` da tool, a
  falha vira `isError: true` com a mensagem **"Parametros invalidos para a
  ferramenta."**.

## Arquitetura

Quatro camadas, todas Effect-native (Effect v4 + PGlite + Drizzle):

- **`src/kernel/**`** — nucleo agnostico de fonte: cliente PGlite/Drizzle com as
  quatro extensoes (`vector`, `pg_textsearch`, `ltree`, `pg_trgm`), embedder
  local, cliente HTTP com retry classificado e backoff exponencial, leitores de
  CSV/XLSX/ZIP, e a persistencia (`db/persistence.ts`) que resolve o diretorio de
  dados.
- **`src/sources/**`** — doze slices de fonte, um por fonte publica. Cada slice e
  um `Context.Service` + um `Layer` (`XLive`) que sabe baixar, normalizar e
  indexar sua fonte e responder suas consultas.
- **`src/serve/**`** — a camada de tools MCP: `tool.ts`/`fold.ts` (definicao e
  serializacao de tools), `server.ts` (servidor MCP sobre o `Server` de baixo
  nivel do `@modelcontextprotocol/sdk`), `status.ts`, `registry.ts`,
  `index-registry.ts` e `tools/<fonte>.ts`.
- **`src/runtime.ts`** — um `ManagedRuntime` sobre o `AppLayer`: as doze fontes
  (`XLive`) sobre a infraestrutura compartilhada (`DbLayer`, embedder,
  `FetchHttpClient`), com a persistencia do diretorio de dados costurada abaixo
  do banco.

A CLI (`src/index.ts`) e o ponto de entrada: `Command.run` sobre
`@effect/platform-bun` (`BunServices.layer` + `BunRuntime.runMain`), com a acao
padrao chamando `serve()` e o subcomando `index` rodando as fontes contra o
`runtime`.

Erros sao declarativos (`Schema.TaggedErrorClass` + `Effect.fail`, nunca
`throw`); o branching usa `Match`; a fan-out de rede e limitada (`concurrency: 2`)
com retry classificado. Sem comentarios no codigo, sem `as`, sem barrels.

## Desenvolvimento

O unico gate e `bun run check` (typecheck + lint:errors + testes de unidade):

```bash
bun run check          # tsc --noEmit + lint:errors (AST) + vitest run
bun run typecheck
bun run lint:errors    # checker AST declarativo, tier estrito em kernel/ e sources/
bun run test:unit      # vitest run
bun run test:integration  # vitest run --config vitest.integration.config.ts
```

Smoke MCP local via stdio:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | bun src/index.ts
```

Deve listar as 53 tools.

## Limites

Este MCP apoia pesquisa e automacao. Ele nao substitui revisao juridica humana,
nao garante consolidacao juridica perfeita e nao deve ser usado como unica fonte
para peticionamento, parecer ou tomada de decisao.

## Licenca

AGPL-3.0-only.

Qualquer distribuicao, modificacao ou servico de rede baseado neste projeto deve
preservar as obrigacoes da AGPL v3, incluindo disponibilizar o codigo-fonte
correspondente das versoes modificadas aos usuarios que interagem com o servico.
