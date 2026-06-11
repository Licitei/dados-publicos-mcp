# dados-publicos-mcp

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![MCP](https://img.shields.io/badge/MCP-stdio-green.svg)](https://modelcontextprotocol.io)

Servidor MCP da Licitei para consulta de dados publicos brasileiros usados em
licitacoes, contratos administrativos, compras publicas e due diligence de
fornecedores e orgaos.

O servidor trabalha em tres camadas:

1. **Legislacao oficial**, baixada do Planalto e indexada localmente em JSON.
   Depois da indexacao, a consulta de normas, trechos e artigos roda offline.
2. **Dados transacionais online**, consultados em tempo real no PNCP e em
   provedores publicos de CNPJ (BrasilAPI/MinhaReceita): licitacoes, contratos,
   atas de registro de preco, orgaos, fornecedores, PCA e agregacoes.
3. **Indices locais de dados publicos**, baixados de fontes oficiais e
   reconstruidos na maquina do usuario (JSON ou SQLite+FTS5). Habilitam buscas
   que nenhuma API oficial gratuita oferece em massa: empresa por nome, socio
   por nome, socios em comum entre fornecedores, sancoes por CNPJ, saude fiscal
   do orgao contratante, e busca de texto livre em diarios e editais.

Tudo sem chave de API e sem banco de terceiros: as fontes sao abertas e os
indices vivem em `~/.local/share/dados-publicos-mcp/`.

## O que resolve

Agentes que trabalham com licitacoes precisam citar a base legal com rapidez e
previsibilidade. Busca aberta na web e scraping em tempo de resposta sao lentos,
ruidosos e pouco auditaveis.

Este MCP faz o caminho oposto:

- fontes oficiais (Planalto, PNCP, Receita Federal, CGU, IBGE, Tesouro, TSE,
  Camara, Querido Diario);
- indices locais (JSON ou SQLite+FTS5), faceis de auditar, reconstruir e usar
  offline;
- tools pequenas e previsiveis para cada dominio;
- consultas online a endpoints publicos do PNCP e BrasilAPI/MinhaReceita;
- cache em memoria com TTL curto para respostas pesadas;
- erros serializados com `better-result`, sem exception solta cruzando boundary.

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

Este servidor cobre tres camadas:

- legislacao oficial, indexada localmente para consulta offline;
- dados transacionais publicos, consultados online no PNCP e em provedores
  publicos de CNPJ;
- indices locais de dados publicos (Receita CNPJ, sancoes CGU, SICAF, CATMAT/
  CATSER, CAPAG, IBGE, CNAE, TSE, Camara, Querido Diario, PNCP offline),
  reconstruidos na maquina do usuario para busca por nome, cruzamento de socios
  e FTS.

A indexacao e sempre client-side (na maquina de quem roda o MCP): nao ha banco
proprio compartilhado, matching proprietario, scoring de fornecedores, analise
de viabilidade nem geracao de propostas. As tools entregam dado bruto
estruturado para o agente raciocinar — a decisao continua sendo humana.

## Ferramentas MCP

| Tool | O que faz |
| --- | --- |
| `listar_normas` | Lista as normas disponiveis no catalogo. |
| `status_indice` | Mostra caminho, status e data de atualizacao do indice local. |
| `indexar_legislacao` | Baixa fontes oficiais do Planalto e recria o indice local. |
| `buscar_legislacao` | Busca termo livre no indice, com filtro opcional por norma. |
| `obter_artigo` | Retorna o texto de um artigo especifico de uma norma indexada. |

### PNCP / CNPJ

| Tool | O que faz |
| --- | --- |
| `search_licitacoes` | Busca editais por data, modalidade, UF, CNPJ do orgao, valor e palavra-chave. |
| `get_licitacao` | Detalhes de uma licitacao pelo `numeroControlePNCP` ou `orgaoCnpj`/`ano`/`sequencial`. |
| `list_licitacao_itens` | Itens/lotes de uma licitacao. |
| `list_licitacao_resultados` | Resultados/vencedores de um item. |
| `list_licitacao_arquivos` | Documentos e anexos do edital. |
| `search_contratos` | Busca contratos por periodo, orgao, fornecedor e palavra-chave. |
| `get_contrato` | Detalhes de um contrato. |
| `list_contrato_termos` | Termos aditivos de um contrato. |
| `list_contrato_instrumentos` | Instrumentos de cobranca de um contrato. |
| `search_atas_rp` | Busca atas de registro de preco, vigentes por padrao. |
| `get_ata_rp` | Detalhes de ata, opcionalmente com itens e arquivos. |
| `get_orgao` | Perfil de orgao publico pelo CNPJ. |
| `get_fornecedor_contratos` | Contratos de um CNPJ como fornecedor. |
| `search_pca` | Planos de Contratacao Anual atualizados no periodo. |
| `list_pca_itens` | Itens planejados de um PCA especifico. |
| `get_cnpj_data` | Dados cadastrais de CNPJ via BrasilAPI ou MinhaReceita. |
| `aggregate_licitacoes_por_periodo` | Serie temporal de licitacoes por dia, semana, mes ou ano. |
| `compare_periodos` | Compara dois periodos e calcula delta absoluto e percentual. |

### Fontes locais (indices reconstruiveis)

Alem da legislacao, o servidor mantem indices locais de varias fontes oficiais.
Cada fonte tem suas proprias tools de consulta/`status`/`indexar` e participa do
registry central de indices. Reconstrua qualquer uma com `index <fonte>`.

| Fonte (`key`) | Storage | Download pesado | Conteudo |
| --- | --- | --- | --- |
| `legislacao` | json | nao | Normas oficiais do Planalto (catalogo). |
| `ibge-localidades` | json | nao | UFs e municipios do IBGE (codigos e nomes). |
| `cnae` | memory | nao | Tabela CNAE 2.0 (secoes a subclasses). |
| `sancoes-cgu` | sqlite | nao | Sancoes (CEIS, CNEP, etc.) da CGU. |
| `catmat-catser` | sqlite | nao | Catalogo de materiais e servicos. |
| `sicaf-fornecedores` | sqlite | nao | Fornecedores SICAF (busca por nome/UF/CNAE). |
| `capag` | sqlite | nao | Capacidade de pagamento de entes (Tesouro). |
| `receita-cnpj` | sqlite | **sim** | Base de CNPJ da Receita Federal (~GBs). |
| `tse-eleitoral` | sqlite | **sim** | Candidaturas e bens declarados (TSE). |
| `camara-deputados` | sqlite | **sim** | Deputados, CEAP e proposicoes. |
| `querido-diario` | sqlite | **sim** | Diarios oficiais municipais (Querido Diario). |
| `pncp-bulk` | sqlite | **sim** | Indice offline do PNCP para FTS e reverse-lookup. |

| Tool | O que faz |
| --- | --- |
| `status_indices` | Lista o status de TODOS os indices locais (existe, storage, atualizacao, registros, heavy, caminho). |

As fontes marcadas com download pesado nao sao baixadas em lote por padrao: rode
`index <fonte>` ou `index --include-heavy`. Cada modulo tambem expoe sua propria
tool `status_*` e `indexar_*` para consulta granular pelo cliente MCP (omitidas
das tabelas abaixo por brevidade).

#### Referencia: localidades e classificacoes

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `resolver_municipio` | `ibge-localidades` | Nome do municipio (+UF) -> codigo IBGE de 7 digitos, exatamente o que o filtro `codigoMunicipioIbge` do PNCP exige. Desambigua homonimos por UF. |
| `resolver_codigo_ibge` | `ibge-localidades` | Codigo IBGE -> nome, UF, mesorregiao e regiao. |
| `listar_municipios_uf` | `ibge-localidades` | Sigla de UF -> todos os municipios com seus codigos. |
| `validar_uf` | `ibge-localidades` | Normaliza e valida sigla de UF. |
| `resolver_cnae` | `cnae` | Codigo de subclasse CNAE -> descricao + hierarquia (classe > grupo > divisao > secao). |
| `buscar_cnae` | `cnae` | Palavra-chave -> subclasses CNAE (indice invertido). |
| `listar_cnaes_por_nivel` | `cnae` | Secao/divisao/grupo/classe -> subclasses descendentes. |

#### Due diligence de fornecedor

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `verificar_sancoes` | `sancoes-cgu` | CNPJ/CPF -> sancoes vigentes e historicas cruzando CEIS, CNEP, CEPIM, CEAF e Acordos de Leniencia. |
| `buscar_sancionado_por_nome` | `sancoes-cgu` | Nome/razao social (FTS) -> sancionados nas cinco listas. |
| `sancoes_vigentes_na_data` | `sancoes-cgu` | Filtra sancoes ativas em um intervalo — due diligence na data do certame. |
| `consultar_cnpj` | `receita-cnpj` | CNPJ completo -> razao social, situacao cadastral, CNAE, endereco, capital, porte, Simples/MEI (offline, sem rate limit). |
| `buscar_empresa_por_nome` | `receita-cnpj` | Razao social / nome fantasia (FTS) -> empresas. Impossivel na consulta CNPJ oficial, que exige o numero. |
| `buscar_socio_por_nome` | `receita-cnpj` | Nome do socio (QSA) -> todas as empresas em que aparece. |
| `socios_em_comum` | `receita-cnpj` | Dois ou mais CNPJs -> socios compartilhados (sinal de conluio/laranjas em licitacao). |
| `filtrar_empresas` | `receita-cnpj` | Filtra por CNAE, UF, municipio, porte e situacao cadastral. |
| `buscar_fornecedor_sicaf` | `sicaf-fornecedores` | Razao social (FTS) -> fornecedores cadastrados no SICAF. A API oficial nunca filtra por nome. |
| `fornecedor_habilitado` | `sicaf-fornecedores` | CNPJ -> ativo + habilitado a licitar. |
| `listar_fornecedores_uf_cnae` | `sicaf-fornecedores` | UF/municipio/CNAE -> fornecedores (prospeccao). |

#### Risco do orgao comprador

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `capag_ente` | `capag` | Codigo IBGE, nome+UF ou sigla de UF -> nota CAPAG (A/B/C/D) + indicadores de endividamento, poupanca corrente e liquidez. |
| `entes_por_nota` | `capag` | Nota (ex.: C/D = alto risco) + UF/regiao -> lista de entes. Mapa de risco fiscal do comprador. |
| `capag_serie_historica` | `capag` | Serie da nota CAPAG de um ente ao longo dos anos. |
| `resolver_ente_por_cnpj` | `capag` | CNPJ do orgao contratante -> codigo IBGE / municipio / UF via tabela `/entes` do SICONFI. |

#### Catalogo de itens

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_material` | `catmat-catser` | Nome de material (FTS) -> codigos CATMAT. A API oficial retorna vazio mesmo para termos existentes. |
| `buscar_servico` | `catmat-catser` | Nome de servico (FTS) -> codigos CATSER. |
| `resolver_catmat_catser` | `catmat-catser` | Codigo -> descricao + hierarquia. |
| `normalizar_item_edital` | `catmat-catser` | Descricao livre de edital -> CATMAT/CATSER mais provaveis para deduplicar e casar com o PNCP. |

#### Conexoes politicas e textos oficiais

| Tool | Fonte | O que faz |
| --- | --- | --- |
| `buscar_doacoes` | `tse-eleitoral` | CPF/CNPJ ou nome do doador -> para quais candidatos doou e quanto. |
| `buscar_fornecedor_campanha` | `tse-eleitoral` | CPF/CNPJ ou nome -> quais campanhas contrataram a empresa. |
| `rastrear_doador_originario` | `tse-eleitoral` | Cadeia de dinheiro repassado por partido/comite. |
| `due_diligence_candidato` | `tse-eleitoral` | Candidatura + bens declarados (risco politico / PEP). |
| `fornecedor_cota_parlamentar` | `camara-deputados` | CNPJ/CPF -> deputados que pagaram ao fornecedor pela cota (CEAP) + total. Reverso que a API oficial nao faz. |
| `gastos_por_fornecedor` | `camara-deputados` | Agrega gasto CEAP por fornecedor/ano/categoria. |
| `buscar_deputado` | `camara-deputados` | Nome -> deputado. |
| `buscar_proposicao` | `camara-deputados` | Palavra-chave em ementa/keywords (FTS) -> proposicoes. |
| `buscar_diarios` | `querido-diario` | FTS no texto de diarios oficiais municipais (cobre o que o PNCP nao alcanca). |
| `buscar_cnpj_em_diario` | `querido-diario` | CNPJ/CPF mencionado no corpo de editais/contratos publicados. |
| `diarios_por_municipio` | `querido-diario` | Codigo IBGE + periodo + palavra-chave. |
| `buscar_pncp_local` | `pncp-bulk` | FTS no objeto de compra/contrato em toda a base local do PNCP. |
| `fornecedor_pncp_por_nome` | `pncp-bulk` | Razao social do fornecedor (FTS) -> contratos. A API online so aceita CNPJ exato. |
| `contratos_do_fornecedor` | `pncp-bulk` | CNPJ -> todos os contratos no historico; agrega gasto por orgao/municipio/UF. |
| `alertas_pncp` | `pncp-bulk` | Editais novos com palavra-chave X em UF Y desde a ultima sincronizacao. |

### Prompts MCP

| Prompt | O que faz |
| --- | --- |
| `analyze_edital` | Roteiro para resumo e checklist de viabilidade de edital. |
| `analyze_orgao` | Perfil 360 de orgao com compras, contratos e PCA. |
| `find_arp_opportunities` | Busca guiada de atas RP vigentes com itens e arquivos. |
| `check_supplier` | Verificacao publica basica de fornecedor por CNPJ. |

### Resources MCP

| URI | Conteudo |
| --- | --- |
| `licitacao://modalidades` | Tabela de codigos de modalidades PNCP. |
| `dados-publicos://scope` | O que este MCP faz e nao faz. |

## Catalogo inicial

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

### Rodando pelo clone do repositorio

Clone, instale dependencias, crie o indice e suba o servidor:

```bash
git clone https://github.com/Licitei/dados-publicos-mcp.git
cd dados-publicos-mcp
bun install
bun run index
bun start
```

Tambem da para chamar a CLI diretamente:

```bash
bun src/index.ts --help
bun src/index.ts index
bun src/index.ts serve
```

`bun src/index.ts` sem argumento tambem inicia o servidor MCP via stdio.

### Indexacao

A CLI `index` reconstroi um ou varios indices locais:

```bash
# Indexa TODAS as fontes leves (requiresHeavyDownload = false). Comportamento
# padrao tambem quando nenhuma flag/arg e passada.
bun src/index.ts index
bun src/index.ts index --all

# Inclui tambem as fontes pesadas (receita-cnpj, tse-eleitoral,
# camara-deputados, querido-diario, pncp-bulk).
bun src/index.ts index --include-heavy

# Reconstroi apenas uma fonte (use a key exata da tabela de fontes locais).
bun src/index.ts index cnae
bun src/index.ts index legislacao
```

`index` sem argumento indexa todas as fontes leves; as pesadas sao puladas e
listadas no log, a menos que `--include-heavy` seja passado. Quando uma fonte
desconhecida e informada, a CLI lista as keys disponiveis e sai com codigo 1.

Flags de escopo simples sao repassadas em `BuildOptions.scope` e lidas pelas
fontes que as conhecem:

```bash
# Recorte por UFs (querido-diario, etc.).
bun src/index.ts index querido-diario --ufs SP,RJ

# Recorte por anos (tse-eleitoral, camara-deputados, etc.).
bun src/index.ts index camara-deputados --anos 2023,2024

# Recorte por mes YYYY-MM (receita-cnpj).
bun src/index.ts index receita-cnpj --mes 2026-01
```

Para inspecionar o que ja esta construido sem reconstruir nada, use a tool MCP
`status_indices` pelo cliente.

### Depois de publicado no npm

Quando o pacote estiver publicado, o servidor pode ser chamado por `bunx`:

```bash
bunx --bun dados-publicos-mcp index
bunx --bun dados-publicos-mcp
```

Para clientes MCP, prefira apontar para o binario via `bunx --bun`:

```json
{
  "mcpServers": {
    "dados-publicos-mcp": {
      "command": "bunx",
      "args": ["--bun", "dados-publicos-mcp"]
    }
  }
}
```

## Configuracao MCP

### Claude Desktop

Edite `claude_desktop_config.json` e adicione:

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

## Como testar no cliente

Depois de conectar o MCP no cliente, pergunte:

```text
Quais ferramentas do dados-publicos-mcp voce tem disponiveis?
```

Prompts uteis:

```text
Liste as normas disponiveis.
```

```text
Busque "habilitacao tecnica" na Lei 14.133 e traga os principais trechos.
```

```text
Traga o artigo 67 da Lei 14.133.
```

```text
Existe alguma norma no catalogo sobre sistema de registro de precos?
```

```text
Quais editais de TI foram publicados nos ultimos 7 dias acima de R$ 200 mil?
```

```text
Tem ata de registro de preco vigente para notebook em SP?
```

```text
Mostre os dados publicos do CNPJ 00000000000191.
```

```text
O CNPJ 00000000000191 aparece em alguma lista de sancao (CEIS/CNEP)?
```

```text
Liste as empresas em que "Joao da Silva" e socio e veja se ha socio em comum
entre elas.
```

```text
Qual a nota CAPAG do municipio de Campinas/SP?
```

> As perguntas de sancoes, CNPJ por nome, socios e CAPAG exigem que a fonte
> correspondente ja tenha sido indexada (`index sancoes-cgu`, `index capag`,
> `index receita-cnpj --include-heavy`, etc.).

## Indice local

Por padrao, cada fonte tem seu proprio diretorio sob:

```text
~/.local/share/dados-publicos-mcp/<fonte>/
  legislacao/index.json
  ibge-localidades/index.json
  cnae/index.json
  sancoes-cgu/sancoes-cgu.db
  receita-cnpj/receita-cnpj.db
  ...
```

Fontes leves usam JSON (auditavel, versionavel, offline). Fontes grandes usam
SQLite com FTS5 (`bun:sqlite` nativo, sem dependencia externa) para busca por
nome e cruzamentos em milhoes de registros. Os arquivos `.db` ficam fora do
controle de versao (`.gitignore`) e do pacote npm — sao gerados localmente.

Voce pode mudar o diretorio raiz:

```bash
DADOS_PUBLICOS_MCP_DATA_DIR=/caminho/local bun run index
```

O servidor tambem mantem cache em memoria para evitar reler indices JSON a cada
chamada.

## Contrato das respostas

As tools retornam texto JSON. Operacoes de dominio usam `better-result` e sao
serializadas no boundary MCP.

Sucesso:

```json
{
  "status": "ok",
  "value": {}
}
```

Erro esperado:

```json
{
  "status": "error",
  "error": {
    "_tag": "IndexNotFoundError",
    "message": "Indice local nao encontrado..."
  }
}
```

`listar_normas` retorna a lista diretamente porque nao depende do indice local.

## Arquitetura

- `src/index.ts`: CLI com `cac` e servidor MCP stdio via SDK oficial.
- `src/core/`: nucleo reutilizavel, agnostico de fonte.
  - `adapter.ts` / `registry.ts`: contrato `IndexAdapter` e registry central de fontes.
  - `store/json-store.ts` / `store/sqlite-store.ts`: persistencia generica (JSON e `bun:sqlite`+FTS5).
  - `http/download.ts`: `fetch` com retry, timeout e download resumivel via HTTP Range.
  - `parse/`: CSV (`;`, aspas, ISO-8859-1/UTF-8), ZIP (sem dep externa, via `node:zlib`), numero e data BR.
  - `normalize.ts` / `dataDir.ts` / `status.ts`: normalizacao de CNPJ/texto, diretorio de dados e status agregado.
- `src/modules/legislacao/`: catalogo, indexer, store e tools da legislacao.
- `src/modules/dados-publicos/`: cliente HTTP, casos de uso PNCP/CNPJ online e o indice offline do PNCP (`pncp-*`).
- `src/modules/<fonte>/`: um modulo por fonte local (catalog, indexer, service, tools), cada um expondo um `IndexAdapter` e um `register<Fonte>Tools`.

Datas e timestamps devem passar por `dayjs`. Nenhuma dependencia npm extra: SQLite,
unzip e HTTP usam APIs nativas do Bun/Node.

## Desenvolvimento

```bash
bun test
bun run typecheck
```

Smoke MCP local:

```bash
printf '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"smoke","version":"0.0.0"}}}\n{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}\n{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}\n' | bun src/index.ts
```

## Troubleshooting

### "Indice local nao encontrado"

Rode:

```bash
bun run index
```

Ou chame a tool `indexar_legislacao` pelo cliente MCP.

### "command not found: bun"

O cliente MCP pode nao herdar o mesmo `PATH` do seu terminal. Use o caminho
absoluto do Bun:

```bash
which bun
```

E coloque esse caminho em `command`.

### O servidor parece travado no terminal

Normal. MCP stdio espera mensagens JSON-RPC pelo `stdin`. Quem deve iniciar o
processo normalmente e o cliente MCP.

### A indexacao falhou ao acessar o Planalto

Tente novamente. O site do Planalto pode fechar conexoes ou responder devagar.
O adapter usa `fetch` nativo do Bun com timeout, retry e user-agent compatível.

## Limites

Este MCP apoia pesquisa e automacao. Ele nao substitui revisao juridica humana,
nao garante consolidacao juridica perfeita e nao deve ser usado como unica fonte
para peticionamento, parecer ou tomada de decisao.

## Licenca

AGPL-3.0-only.

Qualquer distribuicao, modificacao ou servico de rede baseado neste projeto deve
preservar as obrigacoes da AGPL v3, incluindo disponibilizar o codigo-fonte
correspondente das versoes modificadas aos usuarios que interagem com o servico.
