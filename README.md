# Dados Publicos MCP

Servidor MCP para consulta de dados publicos brasileiros com indice local no PC
do usuario.

Esta V1 nasceu para o fluxo da Licitei: responder perguntas de agentes sobre
licitacoes, contratos administrativos, estatais e tratamento de ME/EPP com
citacao para a fonte oficial.

## Ferramentas

- `listar_normas`: lista o catalogo inicial de normas suportadas.
- `status_indice`: mostra onde esta o indice local e quando foi atualizado.
- `indexar_legislacao`: baixa fontes oficiais e recria o indice local.
- `buscar_legislacao`: busca termo livre no indice local.
- `obter_artigo`: retorna um artigo especifico a partir do indice local.

## Catalogo inicial

- Lei 14.133/2021: licitacoes e contratos administrativos.
- Lei 8.666/1993: regime antigo de licitacoes.
- Lei 13.303/2016: estatais.
- Lei Complementar 123/2006: ME/EPP.
- Decreto 11.462/2023: sistema de registro de precos.

As consultas nao dependem de rede em tempo de uso. A rede e usada apenas no
passo de indexacao. O download das fontes usa `ky`, com timeout e retry.

## Uso local

```bash
bun install
bun run index
bun start
```

Config exemplo para cliente MCP:

```json
{
  "mcpServers": {
    "dados-publicos": {
      "command": "bun",
      "args": ["/caminho/para/dados-publicos-mcp/src/index.ts"]
    }
  }
}
```

## Testes

```bash
bun test
```

## Indice local

Por padrao, o indice fica em:

```text
~/.local/share/dados-publicos-mcp/index.json
```

Voce pode mudar o diretorio com:

```bash
DADOS_PUBLICOS_MCP_DATA_DIR=/caminho/local bun run index
```

O arquivo e JSON para facilitar auditoria, backup e distribuicao offline. O
servidor usa `@tanstack/store` agnostico apenas como estado runtime em memoria
para cachear o indice carregado, status de indexacao e erros.

## Escopo juridico

Este servidor retorna trechos de normas oficiais para apoio a pesquisa. Ele nao
substitui revisao juridica humana, nao garante vigencia consolidada perfeita e
nao deve ser usado como unica fonte para peticionamento ou tomada de decisao.

## Licenca

MIT
