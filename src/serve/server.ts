import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import { runtime } from "../runtime";
import { errorContent, foldExit } from "./fold";
import { tools } from "./registry";
import type { Tool } from "./tool";

const runTool = (tool: Tool, args: unknown) =>
  runtime.runPromiseExit(tool.handle(args)).then(foldExit);

const dispatch = (name: string, args: unknown) =>
  Arr.findFirst(tools, (tool) => tool.name === name).pipe(
    Option.match({
      onNone: () =>
        Promise.resolve(errorContent(`Ferramenta desconhecida: ${name}`)),
      onSome: (tool) => runTool(tool, args),
    })
  );

export const makeServer = () => {
  const server = new Server(
    { name: "dados-publicos-mcp", version: "0.1.0" },
    { capabilities: { tools: { listChanged: false } } }
  );

  server.setRequestHandler(ListToolsRequestSchema, () =>
    Promise.resolve({
      tools: Arr.map(tools, (tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      })),
    })
  );

  server.setRequestHandler(CallToolRequestSchema, (request) =>
    dispatch(request.params.name, request.params.arguments)
  );

  return server;
};

export const serve = () => makeServer().connect(new StdioServerTransport());
