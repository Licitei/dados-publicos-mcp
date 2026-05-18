import { Result, TaggedError } from "better-result";
import { z } from "zod";
import {
  buscarLegislacao,
  listarNormas,
  obterArtigo,
  recriarIndice,
  statusIndice,
} from "./service";

type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

const emptyInputJsonSchema = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const;

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

const buscarLegislacaoJsonSchema = {
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
} as const;

const obterArtigoJsonSchema = {
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
} as const;

class ToolInputError extends TaggedError("ToolInputError")<{
  message: string;
  issues: string[];
}>() {}

export const legislacaoTools: ToolDefinition[] = [
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
];

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

  throw new Error(`Ferramenta de legislacao nao encontrada: ${name}`);
}

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
