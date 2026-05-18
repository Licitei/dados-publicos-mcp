# MCP Legislacao BR

Servidor MCP da Licitei para facilitar o acesso de agentes de IA a dados
publicos brasileiros, com foco inicial em legislacao de licitacoes, contratos
administrativos e compras publicas.

O projeto cria um indice local a partir de fontes oficiais do Planalto e expoe
ferramentas MCP para que agentes possam listar normas, buscar trechos e obter
artigos especificos com referencia para a fonte oficial.

## Para que serve

Este MCP nasceu para apoiar fluxos da Licitei em que agentes precisam responder
perguntas sobre licitacoes, contratos administrativos, empresas estatais,
registro de precos e tratamento favorecido para ME/EPP.

Em vez de depender de buscas abertas ou scraping em tempo de resposta, o
servidor usa um indice JSON local. A rede e usada apenas durante a indexacao das
fontes oficiais.

## Ferramentas MCP

- `listar_normas`: lista o catalogo de normas suportadas.
- `status_indice`: mostra o caminho do indice local, status e ultima
  atualizacao.
- `indexar_legislacao`: baixa fontes oficiais do Planalto e recria o indice
  local.
- `buscar_legislacao`: busca um termo livre no indice local, opcionalmente
  filtrando por norma.
- `obter_artigo`: retorna o texto de um artigo especifico de uma norma
  indexada.

## Catalogo inicial

- Lei 14.133/2021: licitacoes e contratos administrativos.
- Lei 8.666/1993: regime antigo de licitacoes.
- Lei 13.303/2016: estatais.
- Lei Complementar 123/2006: ME/EPP e Simples Nacional.
- Decreto 11.462/2023: sistema de registro de precos.

Cada item do catalogo inclui `id`, titulo, URL oficial, temas e apelidos para
facilitar o uso por agentes.

## Uso local

Requisitos:

- Bun 1.1 ou superior.

Instale dependencias, crie o indice e inicie o servidor:

```bash
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

Config exemplo para um cliente MCP:

```json
{
  "mcpServers": {
    "mcp-legislacao-br": {
      "command": "bun",
      "args": ["/caminho/para/mcp-legislacao-br/src/index.ts"]
    }
  }
}
```

Depois de conectado, o agente pode chamar `indexar_legislacao` quando precisar
recriar o indice, ou consultar diretamente `buscar_legislacao` e
`obter_artigo` quando o indice ja existir.

## Indice local

Por padrao, o indice fica em:

```text
~/.local/share/dados-publicos-mcp/legislacao/index.json
```

Voce pode mudar o diretorio com:

```bash
DADOS_PUBLICOS_MCP_DATA_DIR=/caminho/local bun run index
```

O arquivo e JSON para facilitar auditoria, backup e distribuicao offline. Os
dados ficam separados por dataset para permitir novas fontes, como Portal da
Transparencia, sem misturar indices. O modulo mantem um cache simples em memoria
para evitar reler o indice a cada chamada e publica status de indexacao e erros.

## Arquitetura

- `src/index.ts`: CLI com `cac` e servidor MCP stdio via SDK oficial.
- `src/modules/legislacao/tools.ts`: registro das tools MCP e contratos Zod.
- `src/modules/legislacao/service.ts`: casos de uso de legislacao.
- `src/modules/legislacao/indexer.ts`: adapter que monta os documentos
  indexaveis de legislacao.
- `src/modules/legislacao/store.ts`: persistencia, validacao Zod, cache em
  memoria, indexacao e status do indice local.

Para conectar o Portal da Transparencia, o caminho esperado e criar um novo
arquivo de tools em `src/modules/<nome>` e usar um subdiretorio proprio quando
houver persistencia local.

## Desenvolvimento

```bash
bun test
bun run typecheck
```

## Limites

Este servidor retorna trechos de normas oficiais para apoio a pesquisa e
automacao. Ele nao substitui revisao juridica humana, nao garante consolidacao
juridica perfeita e nao deve ser usado como unica fonte para peticionamento,
parecer ou tomada de decisao.

## Licenca

MIT
