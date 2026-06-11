import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { panic, Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { openDb } from "../../core/store/sqlite-store";
import { key as DOMINIO } from "./catalog";
import { queridoDiarioErrors } from "./errors";
import { DB_FILE } from "./store";
import {
  buscarCnpjEmDiario,
  buscarDiarios,
  diariosPorMunicipio,
  dbExistsOnDisk,
  dbPath,
} from "./service";

const ufSchema = z.string().trim().length(2);
const dataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato aaaa-mm-dd.");

const buscarDiariosInputSchema = z
  .object({
    termo: z.string().trim().min(2),
    uf: ufSchema.optional(),
    territoryId: z.string().trim().min(1).optional(),
    dataInicial: dataSchema.optional(),
    dataFinal: dataSchema.optional(),
    limite: z.number().int().positive().max(50).optional(),
  })
  .strict();

const buscarCnpjInputSchema = z
  .object({
    cnpj: z.string().trim().min(11),
    uf: ufSchema.optional(),
    dataInicial: dataSchema.optional(),
    dataFinal: dataSchema.optional(),
    limite: z.number().int().positive().max(50).optional(),
  })
  .strict();

const diariosPorMunicipioInputSchema = z
  .object({
    territoryId: z.string().trim().min(1),
    termo: z.string().trim().min(2).optional(),
    dataInicial: dataSchema.optional(),
    dataFinal: dataSchema.optional(),
    limite: z.number().int().positive().max(50).optional(),
  })
  .strict();

export function registerQueridoDiarioTools(server: McpServer) {
  server.registerTool(
    "buscar_diarios",
    {
      description:
        "Busca full-text no texto extraido dos diarios oficiais municipais (Querido Diario): nome de empresa/fornecedor, objeto de licitacao, modalidade ou numero de edital. Cobre o buraco municipal do PNCP. Filtros opcionais: uf, territoryId (IBGE), periodo (dataInicial/dataFinal aaaa-mm-dd).",
      inputSchema: buscarDiariosInputSchema,
    },
    async (args) =>
      toolContent(await callQueridoDiarioTool("buscar_diarios", args))
  );

  server.registerTool(
    "buscar_cnpj_em_diario",
    {
      description:
        "Busca diarios oficiais municipais que mencionam um CNPJ no corpo de editais e contratos. Aceita o CNPJ com ou sem mascara (14 digitos). Filtros opcionais: uf, periodo.",
      inputSchema: buscarCnpjInputSchema,
    },
    async (args) =>
      toolContent(await callQueridoDiarioTool("buscar_cnpj_em_diario", args))
  );

  server.registerTool(
    "diarios_por_municipio",
    {
      description:
        "Lista diarios oficiais de um municipio pelo codigo IBGE (territory_id), com palavra-chave e periodo opcionais.",
      inputSchema: diariosPorMunicipioInputSchema,
    },
    async (args) =>
      toolContent(await callQueridoDiarioTool("diarios_por_municipio", args))
  );
}

export async function callQueridoDiarioTool(name: string, args: unknown) {
  if (name === "buscar_diarios") {
    const input = parseToolInput(buscarDiariosInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) => buscarDiarios(db, input.value));
  }

  if (name === "buscar_cnpj_em_diario") {
    const input = parseToolInput(buscarCnpjInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) => buscarCnpjEmDiario(db, input.value));
  }

  if (name === "diarios_por_municipio") {
    const input = parseToolInput(diariosPorMunicipioInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) => diariosPorMunicipio(db, input.value));
  }

  return panic(`Ferramenta de querido-diario nao encontrada: ${name}`);
}

/**
 * Abre o banco (somente leitura logica), executa a query e fecha. Se o indice
 * ainda nao existe em disco, retorna um erro orientando a rodar o build pesado.
 */
function withDb<T extends ResultType<unknown, unknown>>(
  run: (db: ReturnType<typeof openDb>) => T
): ReturnType<typeof Result.serialize> {
  if (!dbExistsOnDisk()) {
    return Result.serialize(
      Result.err(queridoDiarioErrors.INDICE_AUSENTE({ path: dbPath() }))
    );
  }

  const db = openDb(DOMINIO, DB_FILE);

  try {
    return Result.serialize(run(db));
  } finally {
    db.close();
  }
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    queridoDiarioErrors.ENTRADA_INVALIDA({
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
