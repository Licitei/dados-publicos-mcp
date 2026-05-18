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

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(await toolModule.callTool(name, args), null, 2),
          },
        ],
      };
    },
  };
}
