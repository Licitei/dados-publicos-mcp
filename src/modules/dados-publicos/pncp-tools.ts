/**
 * Tools MCP do indice offline do PNCP (key "pncp-bulk").
 *
 * Tools registradas (nomes EXATOS da sintese):
 *   - buscar_pncp_local        FTS no objetoCompra/objetoContrato em toda a base
 *   - fornecedor_pncp_por_nome FTS no nomeRazaoSocialFornecedor -> contratos
 *   - contratos_do_fornecedor  niFornecedor (CNPJ) -> contratos + agregacao
 *   - alertas_pncp             editais novos por palavra-chave/UF desde sync
 *
 * Coexiste com registerDadosPublicosTools (modo online); nomes nao colidem.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { dadosPublicosErrors } from "./errors";
import {
  alertasPncp,
  buscarPncpLocal,
  contratosDoFornecedor,
  fornecedorPncpPorNome,
} from "./pncp-service";

const buscarPncpLocalInputSchema = z
  .object({
    termo: z.string().trim().min(2),
    entidade: z.enum(["contratacoes", "contratos", "atas", "todas"]).optional(),
    uf: z.string().trim().length(2).optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const fornecedorPorNomeInputSchema = z
  .object({
    nome: z.string().trim().min(2),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const contratosDoFornecedorInputSchema = z
  .object({
    ni: z.string().trim().min(1),
    limite: z.number().int().positive().max(200).optional(),
    agruparPor: z.enum(["orgao", "municipio", "uf", "nenhum"]).optional(),
  })
  .strict();

const alertasPncpInputSchema = z
  .object({
    termo: z.string().trim().min(2),
    uf: z.string().trim().length(2).optional(),
    desde: z.string().trim().optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict();

const toolDefinitions = {
  buscar_pncp_local: {
    description:
      "Busca full-text (FTS) no objetoCompra/objetoContrato/objetoContratacao em TODO o indice local do PNCP. A API online so filtra por data+modalidade+UF+CNPJ, nao por texto.",
    schema: buscarPncpLocalInputSchema,
    handler: buscarPncpLocal,
  },
  fornecedor_pncp_por_nome: {
    description:
      "Busca fornecedores por NOME/razao social (FTS) no indice local de contratos PNCP, com total de contratos e valor. A API online so aceita CNPJ exato.",
    schema: fornecedorPorNomeInputSchema,
    handler: fornecedorPncpPorNome,
  },
  contratos_do_fornecedor: {
    description:
      "Lista todos os contratos de um fornecedor por niFornecedor (CNPJ/CPF) em todo o historico local e agrega o gasto por orgao, municipio ou UF.",
    schema: contratosDoFornecedorInputSchema,
    handler: contratosDoFornecedor,
  },
  alertas_pncp: {
    description:
      "Editais (contratacoes) novos contendo palavra-chave X, opcionalmente em UF Y, atualizados desde uma data (dataAtualizacaoGlobal). Util para alertas de licitacoes.",
    schema: alertasPncpInputSchema,
    handler: alertasPncp,
  },
} as const;

type PncpToolName = keyof typeof toolDefinitions;

export function registerPncpBulkTools(server: McpServer): void {
  for (const name of Object.keys(toolDefinitions) as PncpToolName[]) {
    const definition = toolDefinitions[name];
    server.registerTool(
      name,
      {
        description: definition.description,
        inputSchema: definition.schema,
      },
      async (args: unknown) => toolContent(await callPncpBulkTool(name, args))
    );
  }
}

export async function callPncpBulkTool(name: PncpToolName, args: unknown) {
  const definition = toolDefinitions[name];
  const input = parseToolInput(definition.schema, args);

  if (Result.isError(input)) return Result.serialize(input);

  const handler = definition.handler as (
    value: never
  ) => Promise<Result<unknown, unknown>> | Result<unknown, unknown>;
  const output = await handler(input.value as never);

  return Result.serialize(output);
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args ?? {});

  if (parsed.success) return Result.ok(parsed.data);

  const issues = parsed.error.issues.map((issue) => issue.message);

  return Result.err(
    dadosPublicosErrors.ENTRADA_INVALIDA({
      detalhe: issues.join("; "),
      internal: { issues, escopo: "indice offline do PNCP" },
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
