#!/usr/bin/env bun

import { createToolRegistry } from "./mcp/registry";
import { legislacaoModule } from "./modules/legislacao/tools";

type JsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
};

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
  };
};

const registry = createToolRegistry([legislacaoModule]);

process.stdin.setEncoding("utf8");

let buffer = "";

process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;

    handleLine(line);
  }
});

async function handleLine(line: string) {
  let request: JsonRpcRequest;

  try {
    request = JSON.parse(line);
  } catch {
    write({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "JSON invalido" },
    });
    return;
  }

  try {
    const result = await route(request);

    if (request.id === undefined) return;

    write({
      jsonrpc: "2.0",
      id: request.id,
      result,
    });
  } catch (error) {
    if (request.id === undefined) return;

    write({
      jsonrpc: "2.0",
      id: request.id,
      error: {
        code: -32000,
        message: String(error),
      },
    });
  }
}

async function route(request: JsonRpcRequest) {
  if (request.method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "dados-publicos-mcp",
        version: "0.1.0",
      },
    };
  }

  if (request.method === "tools/list") {
    return { tools: registry.tools };
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};

    if (typeof name !== "string") {
      throw new Error("Nome da ferramenta ausente");
    }

    return registry.callTool(name, args);
  }

  throw new Error(`Metodo nao suportado: ${request.method}`);
}

function write(response: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
