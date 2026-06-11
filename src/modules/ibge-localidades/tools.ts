import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, panic, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { ibgeLocalidadesErrors } from "./errors";
import { ibgeLocalidadesIndexAdapter } from "./indexer";
import {
  listarMunicipiosUf,
  resolverCodigoIbge,
  resolverMunicipio,
  validarUf,
} from "./service";

const resolverMunicipioInputSchema = z
  .object({
    nome: z.string().trim().min(1),
    uf: z.string().trim().min(2).max(2).optional(),
  })
  .strict();

const resolverCodigoInputSchema = z
  .object({
    codigo: z.string().trim().min(1),
  })
  .strict();

const listarMunicipiosUfInputSchema = z
  .object({
    uf: z.string().trim().min(2).max(2),
  })
  .strict();

const validarUfInputSchema = z
  .object({
    uf: z.string().trim().min(1),
  })
  .strict();

const emptyInputSchema = z.object({}).strict();

export function registerIbgeLocalidadesTools(server: McpServer) {
  server.registerTool(
    "resolver_municipio",
    {
      description:
        "Resolve o nome de um municipio (UF opcional para desambiguar homonimos) para o codigo IBGE de 7 digitos exigido pelo filtro codigoMunicipioIbge do PNCP.",
      inputSchema: resolverMunicipioInputSchema,
    },
    async (args) =>
      toolContent(await callIbgeLocalidadesTool("resolver_municipio", args)),
  );

  server.registerTool(
    "resolver_codigo_ibge",
    {
      description:
        "Resolucao reversa: recebe o codigo IBGE de 7 digitos e retorna nome do municipio, UF, mesorregiao e regiao.",
      inputSchema: resolverCodigoInputSchema,
    },
    async (args) =>
      toolContent(await callIbgeLocalidadesTool("resolver_codigo_ibge", args)),
  );

  server.registerTool(
    "listar_municipios_uf",
    {
      description:
        "Lista todos os municipios de uma UF com seus codigos IBGE de 7 digitos.",
      inputSchema: listarMunicipiosUfInputSchema,
    },
    async (args) =>
      toolContent(await callIbgeLocalidadesTool("listar_municipios_uf", args)),
  );

  server.registerTool(
    "validar_uf",
    {
      description:
        "Normaliza/valida uma sigla de UF (ex SP, rj) e retorna o codigo numerico IBGE da UF.",
      inputSchema: validarUfInputSchema,
    },
    async (args) =>
      toolContent(await callIbgeLocalidadesTool("validar_uf", args)),
  );

  server.registerTool(
    "indexar_ibge_localidades",
    {
      description:
        "Baixa a lista de municipios do IBGE e recria o indice local de localidades neste computador.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(
        await callIbgeLocalidadesTool("indexar_ibge_localidades", args),
      ),
  );
}

export async function callIbgeLocalidadesTool(name: string, args: unknown) {
  if (name === "resolver_municipio") {
    const input = parseToolInput(resolverMunicipioInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await resolverMunicipio(input.value));
  }

  if (name === "resolver_codigo_ibge") {
    const input = parseToolInput(resolverCodigoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await resolverCodigoIbge(input.value.codigo));
  }

  if (name === "listar_municipios_uf") {
    const input = parseToolInput(listarMunicipiosUfInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(await listarMunicipiosUf(input.value.uf));
  }

  if (name === "validar_uf") {
    const input = parseToolInput(validarUfInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(validarUf(input.value.uf));
  }

  if (name === "indexar_ibge_localidades") {
    return Result.serialize(await ibgeLocalidadesIndexAdapter.build());
  }

  return panic(`Ferramenta de IBGE Localidades nao encontrada: ${name}`);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown,
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    ibgeLocalidadesErrors.ENTRADA_INVALIDA({
      internal: {
        issues: parsed.error.issues.map((issue) => issue.message).join("; "),
      },
    }),
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
