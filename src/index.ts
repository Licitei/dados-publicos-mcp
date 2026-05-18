#!/usr/bin/env bun

import {
  buscarLegislacao,
  listarNormas,
  obterArtigo,
  recriarIndice,
  statusIndice,
  type ArtigoInput,
  type SearchInput,
} from "./legislacao";

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

const tools = [
  {
    name: "listar_normas",
    description: "Lista as normas brasileiras disponiveis no catalogo.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "buscar_legislacao",
    description:
      "Busca um termo no indice local de legislacao brasileira.",
    inputSchema: {
      type: "object",
      properties: {
        termo: {
          type: "string",
          description: "Termo a buscar. Exemplo: habilitacao tecnica.",
        },
        norma: {
          type: "string",
          description:
            "Opcional. ID ou apelido da norma, como lei-14133-2021 ou 14133.",
        },
        limite: {
          type: "number",
          description: "Quantidade maxima de resultados. Maximo 25.",
        },
      },
      required: ["termo"],
      additionalProperties: false,
    },
  },
  {
    name: "obter_artigo",
    description: "Retorna um artigo especifico de uma norma brasileira.",
    inputSchema: {
      type: "object",
      properties: {
        norma: {
          type: "string",
          description: "ID ou apelido da norma, como lei-14133-2021 ou 14133.",
        },
        artigo: {
          type: ["string", "number"],
          description: "Numero do artigo. Exemplo: 67.",
        },
      },
      required: ["norma", "artigo"],
      additionalProperties: false,
    },
  },
  {
    name: "status_indice",
    description: "Mostra o status e o caminho do indice local.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
  {
    name: "indexar_legislacao",
    description:
      "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

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
        message: error instanceof Error ? error.message : "Erro interno",
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
    return { tools };
  }

  if (request.method === "tools/call") {
    const name = request.params?.name;
    const args = request.params?.arguments ?? {};

    if (typeof name !== "string") {
      throw new Error("Nome da ferramenta ausente");
    }

    return callTool(name, args);
  }

  throw new Error(`Metodo nao suportado: ${request.method}`);
}

async function callTool(name: string, args: unknown) {
  if (name === "listar_normas") {
    return asToolResult(listarNormas());
  }

  if (name === "buscar_legislacao") {
    return asToolResult(await buscarLegislacao(args as SearchInput));
  }

  if (name === "obter_artigo") {
    return asToolResult(await obterArtigo(args as ArtigoInput));
  }

  if (name === "status_indice") {
    return asToolResult(await statusIndice());
  }

  if (name === "indexar_legislacao") {
    return asToolResult(await recriarIndice());
  }

  throw new Error(`Ferramenta nao encontrada: ${name}`);
}

function asToolResult(data: unknown) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function write(response: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
