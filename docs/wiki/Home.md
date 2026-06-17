# dados-publicos-mcp

Servidor MCP local-first para dados públicos brasileiros usados em licitações, contratos e due diligence.

## Páginas

- [Instalação](Setup.md)
- [Fontes](Sources.md)
- [Tools MCP](Tools.md)
- [Arquitetura](Architecture.md)
- [Contribuição](Contributing.md)

## Ideia central

1. Baixa fontes públicas oficiais.
2. Indexa em um PGlite local.
3. Expõe consultas via MCP stdio.
4. Responde localmente, sem API key e sem banco externo.
