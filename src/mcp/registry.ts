import { Result, type Result as ResultType } from "better-result";

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ToolModule = {
  name: string;
  tools: ToolDefinition[];
  callTool: (name: string, args: unknown) => Promise<unknown> | unknown;
};

export function createToolRegistry(modules: ToolModule[]) {
  const tools = modules.flatMap((module) => module.tools);

  return {
    tools,
    async callTool(name: string, args: unknown) {
      const toolModule = modules.find((module) =>
        module.tools.some((tool) => tool.name === name)
      );

      if (!toolModule) {
        throw new Error(`Ferramenta nao encontrada: ${name}`);
      }

      return asToolResult(await toolModule.callTool(name, args));
    },
  };
}

function asToolResult(
  data: unknown | ResultType<unknown, unknown>
) {
  if (isResult(data)) {
    if (Result.isError(data)) {
      throw new Error(resultErrorMessage(data.error));
    }

    data = data.value;
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

function isResult(value: unknown): value is ResultType<unknown, unknown> {
  if (!value || typeof value !== "object") return false;

  return "status" in value && (value.status === "ok" || value.status === "error");
}

function resultErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "Erro interno";
}
