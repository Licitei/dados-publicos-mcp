import * as Provider from "alchemy/Provider";

export class McpProviders extends Provider.ProviderCollection<McpProviders>()(
  "Mcp"
) {}
