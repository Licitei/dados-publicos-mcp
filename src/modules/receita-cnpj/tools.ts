/**
 * Registro das tools MCP da fonte receita-cnpj.
 *
 * Tools:
 *  - consultar_cnpj
 *  - buscar_empresa_por_nome
 *  - buscar_socio_por_nome
 *  - socios_em_comum
 *  - filtrar_empresas
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { receitaCnpjErrors } from "./errors";
import {
  buscarEmpresaPorNome,
  buscarSocioPorNome,
  consultarCnpj,
  filtrarEmpresas,
  sociosEmComum,
  withDb,
} from "./service";

const consultarCnpjInput = z
  .object({ cnpj: z.string().trim().min(1) })
  .strict();

const buscarEmpresaInput = z
  .object({
    nome: z.string().trim().min(1),
    limite: z.number().int().positive().max(100).optional(),
  })
  .strict();

const buscarSocioInput = z
  .object({
    nome: z.string().trim().min(1),
    cpf_visivel: z.string().trim().min(1).optional(),
    limite: z.number().int().positive().max(100).optional(),
  })
  .strict();

const sociosEmComumInput = z
  .object({ cnpjs: z.array(z.string().trim().min(1)).min(2) })
  .strict();

const filtrarEmpresasInput = z
  .object({
    cnae: z.string().trim().min(1).optional(),
    uf: z.string().trim().min(1).optional(),
    municipio: z.string().trim().min(1).optional(),
    porte: z.string().trim().min(1).optional(),
    situacao: z.string().trim().min(1).optional(),
    limite: z.number().int().positive().max(200).optional(),
  })
  .strict()
  .refine((v) => v.cnae || v.uf || v.municipio || v.porte || v.situacao, {
    message: "Informe ao menos um filtro (cnae, uf, municipio, porte ou situacao).",
  });

export function registerReceitaCnpjTools(server: McpServer): void {
  server.registerTool(
    "consultar_cnpj",
    {
      description:
        "Consulta um CNPJ completo (14 digitos) no indice local da Receita Federal: razao social, nome fantasia, situacao cadastral, CNAE, endereco, capital, porte e Simples/MEI. Offline, sem rate limit.",
      inputSchema: consultarCnpjInput,
    },
    async (args) => toolContent(await callReceitaCnpjTool("consultar_cnpj", args))
  );

  server.registerTool(
    "buscar_empresa_por_nome",
    {
      description:
        "Busca empresas por razao social ou nome fantasia (FTS5). Impossivel na consulta oficial de CNPJ, que exige o numero.",
      inputSchema: buscarEmpresaInput,
    },
    async (args) =>
      toolContent(await callReceitaCnpjTool("buscar_empresa_por_nome", args))
  );

  server.registerTool(
    "buscar_socio_por_nome",
    {
      description:
        "Busca socios por nome (quadro societario QSA) e lista todas as empresas em que aparece. Opcionalmente filtra pelos 6 digitos visiveis do CPF mascarado.",
      inputSchema: buscarSocioInput,
    },
    async (args) =>
      toolContent(await callReceitaCnpjTool("buscar_socio_por_nome", args))
  );

  server.registerTool(
    "socios_em_comum",
    {
      description:
        "Recebe dois ou mais CNPJs e retorna os socios compartilhados (deteccao de conluio/laranjas em licitacoes).",
      inputSchema: sociosEmComumInput,
    },
    async (args) => toolContent(await callReceitaCnpjTool("socios_em_comum", args))
  );

  server.registerTool(
    "filtrar_empresas",
    {
      description:
        "Filtra empresas por CNAE (principal/secundario), UF, municipio (codigo RFB), porte (ME/EPP) e situacao cadastral (ativa/baixada/inapta). Segmentacao de fornecedores.",
      inputSchema: filtrarEmpresasInput,
    },
    async (args) => toolContent(await callReceitaCnpjTool("filtrar_empresas", args))
  );
}

export async function callReceitaCnpjTool(name: string, args: unknown) {
  if (name === "consultar_cnpj") {
    const input = parseToolInput(consultarCnpjInput, args);
    if (Result.isError(input)) return Result.serialize(input);
    const out = await withDb((db) => consultarCnpj(db, input.value.cnpj));
    if (Result.isError(out)) return Result.serialize(out);
    return Result.serialize(out.value);
  }

  if (name === "buscar_empresa_por_nome") {
    const input = parseToolInput(buscarEmpresaInput, args);
    if (Result.isError(input)) return Result.serialize(input);
    const out = await withDb((db) =>
      buscarEmpresaPorNome(db, input.value.nome, input.value.limite)
    );
    return Result.serialize(out);
  }

  if (name === "buscar_socio_por_nome") {
    const input = parseToolInput(buscarSocioInput, args);
    if (Result.isError(input)) return Result.serialize(input);
    const out = await withDb((db) =>
      buscarSocioPorNome(db, input.value.nome, {
        cpfVisivel: input.value.cpf_visivel,
        limite: input.value.limite,
      })
    );
    return Result.serialize(out);
  }

  if (name === "socios_em_comum") {
    const input = parseToolInput(sociosEmComumInput, args);
    if (Result.isError(input)) return Result.serialize(input);
    const out = await withDb((db) => sociosEmComum(db, input.value.cnpjs));
    return Result.serialize(out);
  }

  if (name === "filtrar_empresas") {
    const input = parseToolInput(filtrarEmpresasInput, args);
    if (Result.isError(input)) return Result.serialize(input);
    const out = await withDb((db) => filtrarEmpresas(db, input.value));
    return Result.serialize(out);
  }

  return Result.serialize(
    Result.err(receitaCnpjErrors.TOOL_DESCONHECIDA({ name }))
  );
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): ResultType<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);
  if (parsed.success) return Result.ok(parsed.data);
  return Result.err(
    receitaCnpjErrors.ENTRADA_INVALIDA({
      internal: { issues: parsed.error.issues.map((issue) => issue.message) },
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
