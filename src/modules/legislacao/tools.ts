import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, panic, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { legislacaoErrors } from "./errors";
import {
  buscarLegislacao,
  listarNormas,
  obterArtigo,
  recriarIndice,
  statusIndice,
} from "./service";

const emptyInputSchema = z.object({}).strict();

const buscarLegislacaoInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    norma: z.string().trim().min(1).optional(),
    limite: z.number().int().positive().max(25).optional(),
  })
  .strict();

const obterArtigoInputSchema = z
  .object({
    norma: z.string().trim().min(1),
    artigo: z.union([z.string().trim().min(1), z.number()]),
  })
  .strict();

export function registerLegislacaoTools(server: McpServer) {
  server.registerTool(
    "listar_normas",
    {
      description: "Lista as normas brasileiras disponiveis no catalogo.",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callLegislacaoTool("listar_normas", args))
  );

  server.registerTool(
    "buscar_legislacao",
    {
      description: "Busca um termo no indice local de legislacao brasileira.",
      inputSchema: buscarLegislacaoInputSchema,
    },
    async (args) =>
      toolContent(await callLegislacaoTool("buscar_legislacao", args))
  );

  server.registerTool(
    "obter_artigo",
    {
      description: "Retorna um artigo especifico de uma norma brasileira.",
      inputSchema: obterArtigoInputSchema,
    },
    async (args) => toolContent(await callLegislacaoTool("obter_artigo", args))
  );

  server.registerTool(
    "status_indice",
    {
      description: "Mostra o status e o caminho do indice local.",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callLegislacaoTool("status_indice", args))
  );

  server.registerTool(
    "indexar_legislacao",
    {
      description:
        "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(await callLegislacaoTool("indexar_legislacao", args))
  );
}

export async function callLegislacaoTool(name: string, args: unknown) {
  if (name === "listar_normas") {
    return listarNormas();
  }

  if (name === "buscar_legislacao") {
    const input = parseToolInput(buscarLegislacaoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await buscarLegislacao(input.value));
  }

  if (name === "obter_artigo") {
    const input = parseToolInput(obterArtigoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await obterArtigo(input.value));
  }

  if (name === "status_indice") {
    return Result.serialize(await statusIndice());
  }

  if (name === "indexar_legislacao") {
    return Result.serialize(await recriarIndice());
  }

  return panic(`Ferramenta de legislacao nao encontrada: ${name}`);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    legislacaoErrors.ENTRADA_INVALIDA({
      internal: {
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    })
  );
}

function toolContent(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
  };
}
