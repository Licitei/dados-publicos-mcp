#!/usr/bin/env bun

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Result } from "better-result";
import { cac } from "cac";
import { registerLegislacaoTools } from "./modules/legislacao/tools";
import { recriarIndiceLocal } from "./modules/legislacao/store";

const cli = cac("dados-publicos-mcp");

cli
  .command("[serve]", "Inicia o servidor MCP via stdio")
  .action(async () => {
    await serve();
  });

cli.command("index", "Baixa fontes oficiais e recria o indice local").action(
  async () => {
    const result = await recriarIndiceLocal();

    if (Result.isOk(result)) {
      console.info(`Indice criado em ${result.value.caminho}`);
      console.info(
        `Normas indexadas: ${result.value.normasIndexadas.join(", ")}`
      );
      return;
    }

    console.error(result.error.message);
    process.exitCode = 1;
  }
);

cli.help();
cli.version("0.1.0");
cli.parse();

async function serve() {
  const server = new McpServer({
    name: "dados-publicos-mcp",
    version: "0.1.0",
  });

  registerLegislacaoTools(server);

  await server.connect(new StdioServerTransport());
}
