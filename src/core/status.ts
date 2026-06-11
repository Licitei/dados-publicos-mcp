import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result } from "better-result";
import { z } from "zod";
import type { IndexAdapter, StatusInfo } from "./adapter";
import { listAdapters } from "./registry";

/**
 * Resultado da coleta de status de um dominio. Quando a leitura de status
 * falha (ex: indice corrompido), guardamos a mensagem de erro em vez de
 * derrubar a iteracao inteira.
 */
export type DominioStatus =
  | (StatusInfo & { erro?: undefined })
  | {
      key: string;
      titulo: string;
      erro: string;
    };

/**
 * Itera o registry e coleta o status de cada dominio (existencia, storage,
 * atualizadoEm, registros, heavy, caminho). Falhas individuais nao
 * interrompem a coleta dos demais dominios.
 */
export async function coletarStatusIndices(
  adapters: IndexAdapter[] = listAdapters(),
): Promise<DominioStatus[]> {
  const statuses: DominioStatus[] = [];

  for (const adapter of adapters) {
    const result = await adapter.status();

    if (Result.isOk(result)) {
      statuses.push(result.value);
      continue;
    }

    statuses.push({
      key: adapter.key,
      titulo: adapter.titulo,
      erro: result.error.message,
    });
  }

  return statuses;
}

/**
 * Registra a tool MCP `status_indices`, que retorna o status de todos os
 * dominios indexaveis do servidor.
 */
export function registerStatusTool(server: McpServer): void {
  server.registerTool(
    "status_indices",
    {
      description:
        "Lista o status de todos os indices locais (dominios) do servidor: " +
        "se existe, tipo de storage, data de atualizacao, total de registros, " +
        "se requer download pesado e o caminho no disco. Use antes de indexar " +
        "para decidir o que precisa ser (re)construido.",
      inputSchema: z.object({}).strict(),
    },
    async () => {
      const statuses = await coletarStatusIndices();

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ indices: statuses }, null, 2),
          },
        ],
      };
    },
  );
}
