import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { panic, Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { sicafErrors } from "./errors";
import { sicafFornecedoresIndexAdapter } from "./indexer";
import {
  buscarFornecedor,
  fornecedorHabilitado,
  listarFornecedoresUfCnae,
  statusSicaf,
} from "./service";

const emptyInputSchema = z.object({}).strict();

const buscarFornecedorInputSchema = z
  .object({
    nome: z.string().trim().min(1),
    apenasAtivos: z.boolean().optional(),
    limite: z.number().int().positive().max(100).optional(),
  })
  .strict();

const fornecedorHabilitadoInputSchema = z
  .object({
    cnpj: z.string().trim().min(1),
  })
  .strict();

const listarUfCnaeInputSchema = z
  .object({
    uf: z.string().trim().length(2).optional(),
    municipio: z.string().trim().min(1).optional(),
    cnae: z.number().int().positive().optional(),
    apenasAtivos: z.boolean().optional(),
    limite: z.number().int().positive().max(500).optional(),
  })
  .strict()
  .refine(
    (v) => Boolean(v.uf || v.municipio || v.cnae !== undefined),
    "Informe ao menos um filtro: uf, municipio ou cnae.",
  );

export function registerSicafFornecedoresTools(server: McpServer) {
  server.registerTool(
    "buscar_fornecedor_sicaf",
    {
      description:
        "Busca fornecedores do SICAF por nome / razao social (full-text). A API oficial nao filtra por nome; este indice local resolve isso.",
      inputSchema: buscarFornecedorInputSchema,
    },
    async (args) =>
      toolContent(
        await callSicafFornecedoresTool("buscar_fornecedor_sicaf", args),
      ),
  );

  server.registerTool(
    "fornecedor_habilitado",
    {
      description:
        "Verifica por CNPJ se um fornecedor esta ativo e habilitado a licitar no SICAF, offline.",
      inputSchema: fornecedorHabilitadoInputSchema,
    },
    async (args) =>
      toolContent(
        await callSicafFornecedoresTool("fornecedor_habilitado", args),
      ),
  );

  server.registerTool(
    "listar_fornecedores_uf_cnae",
    {
      description:
        "Lista/segmenta fornecedores do SICAF por UF, municipio e/ou CNAE (filtros que a API oficial nao expoe).",
      inputSchema: listarUfCnaeInputSchema,
    },
    async (args) =>
      toolContent(
        await callSicafFornecedoresTool("listar_fornecedores_uf_cnae", args),
      ),
  );

  server.registerTool(
    "status_sicaf_fornecedores",
    {
      description:
        "Mostra o status e o caminho do indice local de fornecedores do SICAF.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(
        await callSicafFornecedoresTool("status_sicaf_fornecedores", args),
      ),
  );

  server.registerTool(
    "indexar_sicaf_fornecedores",
    {
      description:
        "Baixa o cadastro de fornecedores do Compras.gov.br (SICAF) e recria o indice local neste computador.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(
        await callSicafFornecedoresTool("indexar_sicaf_fornecedores", args),
      ),
  );
}

export async function callSicafFornecedoresTool(name: string, args: unknown) {
  if (name === "buscar_fornecedor_sicaf") {
    const input = parseToolInput(buscarFornecedorInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(buscarFornecedor(input.value));
  }

  if (name === "fornecedor_habilitado") {
    const input = parseToolInput(fornecedorHabilitadoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(fornecedorHabilitado(input.value.cnpj));
  }

  if (name === "listar_fornecedores_uf_cnae") {
    const input = parseToolInput(listarUfCnaeInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(listarFornecedoresUfCnae(input.value));
  }

  if (name === "status_sicaf_fornecedores") {
    return Result.serialize(Result.ok(await statusSicaf()));
  }

  if (name === "indexar_sicaf_fornecedores") {
    return Result.serialize(await sicafFornecedoresIndexAdapter.build());
  }

  return panic(`Ferramenta de SICAF fornecedores nao encontrada: ${name}`);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown,
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    sicafErrors.ENTRADA_INVALIDA({
      internal: {
        issues: parsed.error.issues.map((issue) => issue.message),
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
