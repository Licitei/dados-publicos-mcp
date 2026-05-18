import { Result, TaggedError } from "better-result";
import { z } from "zod";
import type { ToolModule } from "../../mcp/registry";
import {
  buscarLegislacao,
  listarNormas,
  obterArtigo,
  recriarIndice,
  statusIndice,
} from "./service";
import {
  buscarLegislacaoJsonSchema,
  buscarLegislacaoInputSchema,
  emptyInputJsonSchema,
  obterArtigoJsonSchema,
  obterArtigoInputSchema,
} from "./schemas";

class ToolInputError extends TaggedError("ToolInputError")<{
  message: string;
  issues: string[];
}>() {}

export const legislacaoModule: ToolModule = {
  name: "legislacao",
  tools: [
    {
      name: "listar_normas",
      description: "Lista as normas brasileiras disponiveis no catalogo.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
    {
      name: "buscar_legislacao",
      description:
        "Busca um termo no indice local de legislacao brasileira.",
      inputSchema: {
        ...buscarLegislacaoJsonSchema,
      },
    },
    {
      name: "obter_artigo",
      description: "Retorna um artigo especifico de uma norma brasileira.",
      inputSchema: {
        ...obterArtigoJsonSchema,
      },
    },
    {
      name: "status_indice",
      description: "Mostra o status e o caminho do indice local.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
    {
      name: "indexar_legislacao",
      description:
        "Baixa fontes oficiais do Planalto e recria o indice local neste computador.",
      inputSchema: {
        ...emptyInputJsonSchema,
      },
    },
  ],
  async callTool(name, args) {
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

    throw new Error(`Ferramenta de legislacao nao encontrada: ${name}`);
  },
};

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, ToolInputError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    new ToolInputError({
      message: "Entrada invalida para ferramenta de legislacao.",
      issues: parsed.error.issues.map((issue) => issue.message),
    })
  );
}
