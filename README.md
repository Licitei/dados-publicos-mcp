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
Transparencia, sem misturar indices ou cache runtime. O servidor usa
`@tanstack/store` apenas como estado runtime em memoria para cachear o indice
carregado, status de indexacao e erros.

## Arquitetura

- `src/router.ts`: router oRPC da aplicacao.
- `src/legislacao-router.ts`: procedures oRPC do dominio de legislacao.
- `src/index.ts`: adapter MCP stdio, sem conhecer detalhes dos dominios.
- `src/registry.ts`: registro de modulos de ferramentas expostas ao MCP.
- `src/legislacao-tools.ts`: mapeia ferramentas MCP para procedures oRPC.
- `src/datasets.ts`: paths de dados por dataset.
- `src/store.ts` e `src/runtime-store.ts`: indice local e cache runtime do
  dataset de legislacao.

Para conectar o Portal da Transparencia, o caminho esperado e criar um novo
modulo de ferramentas, um dataset proprio e registrar esse modulo no registry.

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
