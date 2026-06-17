# Instalação

## Requisitos

- Bun 1.1+

## Instalar

```bash
bun install
```

## Rodar servidor MCP

```bash
bun run start
```

## Indexar dados

Fontes leves:

```bash
bun run index
```

Uma fonte:

```bash
bun src/index.ts index legislacao
```

Tudo, incluindo downloads pesados:

```bash
bun src/index.ts index --include-heavy
```

Recortes úteis:

```bash
bun src/index.ts index pncp --mes 2026-01
bun src/index.ts index querido-diario --ufs SP,RJ --anos 2024,2025
```

## Configuração MCP

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
