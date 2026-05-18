# dados-publicos-mcp

[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](./LICENSE)
[![Runtime: Bun](https://img.shields.io/badge/runtime-Bun-black.svg)](https://bun.sh)
[![MCP](https://img.shields.io/badge/MCP-stdio-green.svg)](https://modelcontextprotocol.io)

Servidor MCP da Licitei para consulta local de legislacao brasileira usada em
licitacoes, contratos administrativos e compras publicas.

Ele baixa normas oficiais do Planalto, cria um indice JSON local e expoe tools
MCP para agentes buscarem trechos e artigos com referencia para a fonte oficial.
Depois da indexacao, as consultas nao dependem de rede.

## O que resolve

Agentes que trabalham com licitacoes precisam citar a base legal com rapidez e
previsibilidade. Busca aberta na web e scraping em tempo de resposta sao lentos,
ruidosos e pouco auditaveis.

Este MCP faz o caminho oposto:

- fonte oficial do Planalto;
- indice local em JSON, facil de auditar e versionar;
- consulta offline depois da indexacao;
- tools pequenas para listar normas, buscar termos e obter artigos;
- erros serializados com `better-result`, sem exception solta cruzando boundary.

Exemplos de perguntas que um agente pode responder usando este MCP:

- "O que a Lei 14.133 fala sobre habilitacao tecnica?"
- "Traga o art. 67 da nova lei de licitacoes."
- "Onde a LC 123 trata de tratamento favorecido para ME/EPP?"
- "Quais normas do catalogo falam de registro de precos?"
- "Busque mencoes a consorcio na Lei 14.133."

## Escopo

Este servidor e focado em legislacao. Ele nao busca editais, contratos, atas ou
CNPJ em tempo real.

Esse recorte e intencional. O Licinexus MCP cobre PNCP, contratos, atas de
registro de preco, PCA, orgaos e CNPJ via endpoints publicos. Este projeto fica
no fundamento normativo: leis e decretos oficiais, indexados localmente para
consulta estavel por agentes.

## Ferramentas MCP

| Tool | O que faz |
| --- | --- |
| `listar_normas` | Lista as normas disponiveis no catalogo. |
| `status_indice` | Mostra caminho, status e data de atualizacao do indice local. |
| `indexar_legislacao` | Baixa fontes oficiais do Planalto e recria o indice local. |
| `buscar_legislacao` | Busca termo livre no indice, com filtro opcional por norma. |
| `obter_artigo` | Retorna o texto de um artigo especifico de uma norma indexada. |

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

## Indice local

Por padrao, o indice fica em:

```text
~/.local/share/dados-publicos-mcp/legislacao/index.json
```

Voce pode mudar o diretorio:

```bash
DADOS_PUBLICOS_MCP_DATA_DIR=/caminho/local bun run index
```

O arquivo e JSON. Isso facilita auditoria, backup, distribuicao offline e testes.
O servidor tambem mantem cache em memoria para evitar reler o indice a cada
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
- `src/modules/legislacao/tools.ts`: registro das tools MCP e contratos Zod.
- `src/modules/legislacao/service.ts`: casos de uso de legislacao.
- `src/modules/legislacao/indexer.ts`: download e extracao das fontes oficiais.
- `src/modules/legislacao/store.ts`: persistencia, validacao Zod, cache e status.
- `src/modules/legislacao/catalog.ts`: catalogo das normas suportadas.

Datas e timestamps devem passar por `dayjs`.

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
