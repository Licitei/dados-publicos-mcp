/**
 * Tools MCP da fonte CAPAG.
 *
 * Tools (nomes exatos da sintese):
 * - capag_ente: por cod_ibge / nome+uf (municipio) / uf (estado) -> nota + 3 indicadores
 * - entes_por_nota: lista entes com nota (ex C/D = alto risco) por UF/regiao
 * - capag_serie_historica: serie da nota CAPAG de um ente ao longo dos anos
 * - resolver_ente_por_cnpj: CNPJ do orgao -> cod_ibge/municipio/UF (+ CAPAG)
 *
 * Tools auxiliares: indexar_capag, status_capag.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { panic, Result } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { existsSync } from "node:fs";
import { dominioPath } from "../../core/dataDir";
import { DB_FILE, DOMINIO } from "./catalog";
import { capagErrors } from "./errors";
import { capagIndexAdapter } from "./indexer";
import {
  capagEnte,
  capagSerieHistorica,
  countCapag,
  entesPorNota,
  openCapagDb,
  resolverEntePorCnpj,
} from "./service";

const ufSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}$/, "UF deve ter 2 letras")
  .transform((s) => s.toUpperCase());

const capagEnteInputSchema = z
  .object({
    cod_ibge: z.string().trim().min(6).optional(),
    nome: z.string().trim().min(1).optional(),
    uf: ufSchema.optional(),
    ano: z.number().int().optional(),
  })
  .strict()
  .refine((v) => v.cod_ibge || v.nome || v.uf, {
    message: "Informe cod_ibge, nome (com uf) ou uf.",
  });

const entesPorNotaInputSchema = z
  .object({
    notas: z.array(z.string().trim().min(1)).min(1),
    uf: ufSchema.optional(),
    regiao: z.string().trim().min(1).optional(),
    ano: z.number().int().optional(),
    incluir_estados: z.boolean().optional(),
    incluir_municipios: z.boolean().optional(),
    limite: z.number().int().positive().max(2000).optional(),
  })
  .strict();

const serieInputSchema = z
  .object({
    cod_ibge: z.string().trim().min(6).optional(),
    nome: z.string().trim().min(1).optional(),
    uf: ufSchema.optional(),
  })
  .strict()
  .refine((v) => v.cod_ibge || v.nome || v.uf, {
    message: "Informe cod_ibge, nome ou uf.",
  });

const cnpjInputSchema = z
  .object({ cnpj: z.string().trim().min(11) })
  .strict();

const emptyInputSchema = z.object({}).strict();

export function registerCapagTools(server: McpServer): void {
  server.registerTool(
    "capag_ente",
    {
      description:
        "CAPAG de um ente: por codigo IBGE (7d) ou nome+UF (municipio) ou sigla UF (estado). Retorna nota CAPAG (A/B/C/D, com +) e os 3 indicadores (endividamento, poupanca corrente, liquidez).",
      inputSchema: capagEnteInputSchema,
    },
    async (args) => toolContent(await callCapagTool("capag_ente", args))
  );

  server.registerTool(
    "entes_por_nota",
    {
      description:
        "Lista entes (estados e/ou municipios) com nota CAPAG informada (ex.: C/D = alto risco de pagamento), filtrando por UF/regiao. Mapa de risco fiscal do comprador publico.",
      inputSchema: entesPorNotaInputSchema,
    },
    async (args) => toolContent(await callCapagTool("entes_por_nota", args))
  );

  server.registerTool(
    "capag_serie_historica",
    {
      description:
        "Serie historica da nota CAPAG de um ente ao longo dos anos (tendencia de deterioracao/melhora).",
      inputSchema: serieInputSchema,
    },
    async (args) =>
      toolContent(await callCapagTool("capag_serie_historica", args))
  );

  server.registerTool(
    "resolver_ente_por_cnpj",
    {
      description:
        "CNPJ do orgao contratante -> cod_ibge/municipio/UF via tabela /entes do SICONFI (ponte), anexando a CAPAG do ente. CNPJ resolve a nivel prefeitura/governo; autarquias caem para fallback por municipio/UF.",
      inputSchema: cnpjInputSchema,
    },
    async (args) =>
      toolContent(await callCapagTool("resolver_ente_por_cnpj", args))
  );

  server.registerTool(
    "status_capag",
    {
      description: "Status do indice local CAPAG (contagens e caminho do SQLite).",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callCapagTool("status_capag", args))
  );

  server.registerTool(
    "indexar_capag",
    {
      description:
        "Baixa CAPAG (estados CSV historico + municipios XLSX) e /entes do SICONFI e recria o indice SQLite local.",
      inputSchema: emptyInputSchema,
    },
    async (args) => toolContent(await callCapagTool("indexar_capag", args))
  );
}

export async function callCapagTool(name: string, args: unknown) {
  if (name === "indexar_capag") {
    return Result.serialize(await capagIndexAdapter.build());
  }

  if (name === "status_capag") {
    return Result.serialize(await capagIndexAdapter.status());
  }

  if (name === "capag_ente") {
    const input = parseToolInput(capagEnteInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      Result.serialize(
        capagEnte(db, {
          codIbge: input.value.cod_ibge,
          nome: input.value.nome,
          uf: input.value.uf,
          ano: input.value.ano,
        })
      )
    );
  }

  if (name === "entes_por_nota") {
    const input = parseToolInput(entesPorNotaInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      Result.serialize(
        entesPorNota(db, {
          notas: input.value.notas,
          uf: input.value.uf,
          regiao: input.value.regiao,
          ano: input.value.ano,
          incluirEstados: input.value.incluir_estados,
          incluirMunicipios: input.value.incluir_municipios,
          limite: input.value.limite,
        })
      )
    );
  }

  if (name === "capag_serie_historica") {
    const input = parseToolInput(serieInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      Result.serialize(
        capagSerieHistorica(db, {
          codIbge: input.value.cod_ibge,
          nome: input.value.nome,
          uf: input.value.uf,
        })
      )
    );
  }

  if (name === "resolver_ente_por_cnpj") {
    const input = parseToolInput(cnpjInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      Result.serialize(resolverEntePorCnpj(db, input.value.cnpj))
    );
  }

  return panic(`Ferramenta CAPAG nao encontrada: ${name}`);
}

function withDb<T>(fn: (db: import("bun:sqlite").Database) => T): T {
  const caminho = dominioPath(DOMINIO, DB_FILE);

  if (!existsSync(caminho)) {
    return Result.serialize(
      Result.err(capagErrors.INDICE_AUSENTE({ path: caminho }))
    ) as T;
  }

  const db = openCapagDb();

  try {
    return fn(db);
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
    capagErrors.ENTRADA_INVALIDA({
      detalhe: `Entrada invalida para ferramenta CAPAG: ${parsed.error.issues
        .map((issue) => issue.message)
        .join("; ")}`,
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

// Reexport de contagem para conveniencia de status custom externos.
export { countCapag };
