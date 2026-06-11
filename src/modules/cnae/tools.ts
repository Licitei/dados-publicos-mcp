import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, panic, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import {
  buscarCnae,
  indexarCnae,
  listarCnaesPorNivel,
  resolverCnae,
  statusCnae,
} from "./service";
import { cnaeErrors } from "./errors";

const emptyInputSchema = z.object({}).strict();

const resolverCnaeInputSchema = z
  .object({
    codigo: z.string().trim().min(1),
  })
  .strict();

const buscarCnaeInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    limite: z.number().int().positive().max(50).optional(),
  })
  .strict();

const listarPorNivelInputSchema = z
  .object({
    codigo: z.string().trim().min(1),
  })
  .strict();

export function registerCnaeTools(server: McpServer): void {
  server.registerTool(
    "resolver_cnae",
    {
      description:
        "Resolve um codigo de subclasse CNAE (7 digitos, com ou sem mascara de pontuacao, ex 4929-9/02 ou 4929902) para a descricao oficial e a hierarquia completa (classe > grupo > divisao > secao).",
      inputSchema: resolverCnaeInputSchema,
    },
    async (args) => toolContent(await callCnaeTool("resolver_cnae", args))
  );

  server.registerTool(
    "buscar_cnae",
    {
      description:
        "Busca subclasses CNAE por palavra-chave na descricao e nas atividades economicas (indice invertido em memoria sobre texto normalizado, sem acento).",
      inputSchema: buscarCnaeInputSchema,
    },
    async (args) => toolContent(await callCnaeTool("buscar_cnae", args))
  );

  server.registerTool(
    "listar_cnaes_por_nivel",
    {
      description:
        "Lista as subclasses descendentes de um codigo de secao (letra A-U), divisao (2 digitos), grupo (3 digitos) ou classe (5 digitos).",
      inputSchema: listarPorNivelInputSchema,
    },
    async (args) =>
      toolContent(await callCnaeTool("listar_cnaes_por_nivel", args))
  );

  server.registerTool(
    "status_cnae",
    {
      description:
        "Mostra o status e o caminho do indice local CNAE (existencia, data, total de subclasses).",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callCnaeTool("status_cnae", args))
  );

  server.registerTool(
    "indexar_cnae",
    {
      description:
        "Baixa a tabela CNAE 2.0 do IBGE (~3,6 MB, 1332 subclasses) e recria o indice local neste computador.",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callCnaeTool("indexar_cnae", args))
  );
}

export async function callCnaeTool(name: string, args: unknown) {
  if (name === "resolver_cnae") {
    const input = parseToolInput(resolverCnaeInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await resolverCnae(input.value.codigo));
  }

  if (name === "buscar_cnae") {
    const input = parseToolInput(buscarCnaeInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(
      await buscarCnae(input.value.termo, input.value.limite)
    );
  }

  if (name === "listar_cnaes_por_nivel") {
    const input = parseToolInput(listarPorNivelInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await listarCnaesPorNivel(input.value.codigo));
  }

  if (name === "status_cnae") {
    return Result.serialize(await statusCnae());
  }

  if (name === "indexar_cnae") {
    return Result.serialize(await indexarCnae());
  }

  return panic(`Ferramenta de CNAE nao encontrada: ${name}`);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    cnaeErrors.ENTRADA_INVALIDA({
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
