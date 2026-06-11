import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { panic, Result } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { tseEleitoralErrors } from "./errors";
import {
  abrirBanco,
  buscarDoacoes,
  buscarFornecedorCampanha,
  dueDiligenceCandidato,
  rastrearDoadorOriginario,
} from "./service";

const buscarDoacoesInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    ano: z.number().int().optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const buscarFornecedorInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    ano: z.number().int().optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const rastrearOriginarioInputSchema = z
  .object({
    cpfCnpj: z.string().trim().min(1),
    ano: z.number().int().optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const dueDiligenceInputSchema = z
  .object({
    cpf: z.string().trim().min(1).optional(),
    sqCandidato: z.string().trim().min(1).optional(),
    ano: z.number().int().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.cpf) || Boolean(v.sqCandidato), {
    message: "Informe cpf ou sqCandidato.",
  });

export function registerTseEleitoralTools(server: McpServer) {
  server.registerTool(
    "buscar_doacoes",
    {
      description:
        "Busca doacoes/receitas eleitorais por CPF/CNPJ ou nome do doador. " +
        "Retorna para quais candidatos a pessoa/empresa doou e quanto. Fonte: TSE (CC-BY).",
      inputSchema: buscarDoacoesInputSchema,
    },
    async (args) => toolContent(callTseTool("buscar_doacoes", args))
  );

  server.registerTool(
    "buscar_fornecedor_campanha",
    {
      description:
        "Busca fornecedores de campanha (despesas contratadas) por CPF/CNPJ ou nome. " +
        "Retorna quais campanhas contrataram a empresa/pessoa. Fonte: TSE (CC-BY).",
      inputSchema: buscarFornecedorInputSchema,
    },
    async (args) => toolContent(callTseTool("buscar_fornecedor_campanha", args))
  );

  server.registerTool(
    "rastrear_doador_originario",
    {
      description:
        "Rastreia a cadeia de doacao via doador originario (CPF/CNPJ). " +
        "Mostra dinheiro repassado por partido/comite ate o candidato final. Fonte: TSE (CC-BY).",
      inputSchema: rastrearOriginarioInputSchema,
    },
    async (args) => toolContent(callTseTool("rastrear_doador_originario", args))
  );

  server.registerTool(
    "due_diligence_candidato",
    {
      description:
        "Due diligence de candidato por CPF ou SQ_CANDIDATO: candidatura(s) e bens declarados " +
        "(util para risco politico / pessoa politicamente exposta). Fonte: TSE (CC-BY).",
      inputSchema: dueDiligenceInputSchema,
    },
    async (args) => toolContent(callTseTool("due_diligence_candidato", args))
  );
}

export function callTseTool(name: string, args: unknown) {
  if (name === "buscar_doacoes") {
    const input = parseToolInput(buscarDoacoesInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return runQuery((db) => buscarDoacoes(db, input.value));
  }

  if (name === "buscar_fornecedor_campanha") {
    const input = parseToolInput(buscarFornecedorInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return runQuery((db) => buscarFornecedorCampanha(db, input.value));
  }

  if (name === "rastrear_doador_originario") {
    const input = parseToolInput(rastrearOriginarioInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return runQuery((db) => rastrearDoadorOriginario(db, input.value));
  }

  if (name === "due_diligence_candidato") {
    const input = parseToolInput(dueDiligenceInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return runQuery((db) => dueDiligenceCandidato(db, input.value));
  }

  // Estado impossivel: o roteamento de tools so chama nomes registrados acima.
  return panic(`Ferramenta TSE nao encontrada: ${name}`);
}

function runQuery<T>(fn: (db: import("bun:sqlite").Database) => T) {
  const opened = abrirBanco();

  if (Result.isError(opened)) return Result.serialize(opened);

  const db = opened.value;

  return Result.serialize(Result.ok(fn(db)));
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    tseEleitoralErrors.ENTRADA_INVALIDA({
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
