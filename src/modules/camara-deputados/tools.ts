import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { panic, Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { camaraErrors } from "./errors";
import { camaraDeputadosIndexAdapter } from "./indexer";
import {
  buscarDeputado,
  buscarProposicao,
  fornecedorCotaParlamentar,
  gastosPorFornecedor,
  statusCamara,
} from "./service";

const fornecedorCotaInputSchema = z
  .object({
    cnpjCpf: z.string().trim().min(1),
    ano: z.number().int().min(2008).max(2026).optional(),
    limite: z.number().int().positive().max(500).optional(),
  })
  .strict();

const gastosPorFornecedorInputSchema = z
  .object({
    fornecedor: z.string().trim().min(2).optional(),
    cnpjCpf: z.string().trim().min(1).optional(),
    ano: z.number().int().min(2008).max(2026).optional(),
    categoria: z.string().trim().min(2).optional(),
    limite: z.number().int().positive().max(500).optional(),
  })
  .strict();

const buscarDeputadoInputSchema = z
  .object({
    nome: z.string().trim().min(1).optional(),
    id: z.number().int().positive().optional(),
    uf: z.string().trim().length(2).optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const buscarProposicaoInputSchema = z
  .object({
    termo: z.string().trim().min(2),
    ano: z.number().int().min(2008).max(2026).optional(),
    tipo: z.string().trim().min(1).optional(),
    incluirAutores: z.boolean().optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const indexarInputSchema = z
  .object({
    anos: z.array(z.number().int().min(2008).max(2026)).optional(),
    anoInicial: z.number().int().min(2008).max(2026).optional(),
    anoFinal: z.number().int().min(2008).max(2026).optional(),
    incluirProposicoes: z.boolean().optional(),
    pularDeputados: z.boolean().optional(),
  })
  .strict();

const emptyInputSchema = z.object({}).strict();

export function registerCamaraDeputadosTools(server: McpServer) {
  server.registerTool(
    "fornecedor_cota_parlamentar",
    {
      description:
        "Reverse-lookup: dado um CNPJ/CPF de fornecedor (txtCNPJCPF), lista todos os deputados que lhe pagaram via cota parlamentar (CEAP) e a soma de vlrLiquido. A API oficial so lista despesas POR deputado; este cruzamento so e possivel com os arquivos indexados localmente.",
      inputSchema: fornecedorCotaInputSchema,
    },
    async (args) =>
      toolContent(await callCamaraTool("fornecedor_cota_parlamentar", args)),
  );

  server.registerTool(
    "gastos_por_fornecedor",
    {
      description:
        "Agrega gastos de cota parlamentar (CEAP) por fornecedor, com filtros opcionais por nome do fornecedor (busca FTS), CNPJ/CPF, ano e categoria de despesa (txtDescricao).",
      inputSchema: gastosPorFornecedorInputSchema,
    },
    async (args) =>
      toolContent(await callCamaraTool("gastos_por_fornecedor", args)),
  );

  server.registerTool(
    "buscar_deputado",
    {
      description:
        "Busca deputado por nome ou nome civil (busca normalizada, sem acento), por id ou por UF de nascimento. O CPF vem 100% vazio nos arquivos publicos; a identidade confiavel e o id.",
      inputSchema: buscarDeputadoInputSchema,
    },
    async (args) => toolContent(await callCamaraTool("buscar_deputado", args)),
  );

  server.registerTool(
    "buscar_proposicao",
    {
      description:
        "Busca proposicoes por palavra-chave em ementa, ementa detalhada e keywords (busca FTS), com filtros opcionais por ano e tipo. Pode incluir os autores de cada proposicao.",
      inputSchema: buscarProposicaoInputSchema,
    },
    async (args) =>
      toolContent(await callCamaraTool("buscar_proposicao", args)),
  );

  server.registerTool(
    "status_camara",
    {
      description:
        "Mostra o status, o caminho e as contagens do indice local da Camara dos Deputados.",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callCamaraTool("status_camara", args)),
  );

  server.registerTool(
    "indexar_camara",
    {
      description:
        "DOWNLOAD PESADO: baixa os arquivos da Camara (deputados + CEAP por ano, opcionalmente proposicoes) e recria o indice SQLite local neste computador. Use anos/anoInicial/anoFinal para limitar o escopo.",
      inputSchema: indexarInputSchema,
    },
    async (args) => toolContent(await callCamaraTool("indexar_camara", args)),
  );
}

export async function callCamaraTool(name: string, args: unknown) {
  if (name === "fornecedor_cota_parlamentar") {
    const input = parseToolInput(fornecedorCotaInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(fornecedorCotaParlamentar(input.value));
  }

  if (name === "gastos_por_fornecedor") {
    const input = parseToolInput(gastosPorFornecedorInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(gastosPorFornecedor(input.value));
  }

  if (name === "buscar_deputado") {
    const input = parseToolInput(buscarDeputadoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(buscarDeputado(input.value));
  }

  if (name === "buscar_proposicao") {
    const input = parseToolInput(buscarProposicaoInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(buscarProposicao(input.value));
  }

  if (name === "status_camara") {
    return Result.serialize(statusCamara());
  }

  if (name === "indexar_camara") {
    const input = parseToolInput(indexarInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(
      await camaraDeputadosIndexAdapter.build({ scope: input.value }),
    );
  }

  // Estado impossivel: o roteador so e chamado com nomes registrados acima.
  return panic(`Ferramenta da Camara nao encontrada: ${name}`);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown,
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    camaraErrors.ENTRADA_INVALIDA({
      internal: { issues: parsed.error.issues.map((issue) => issue.message) },
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
