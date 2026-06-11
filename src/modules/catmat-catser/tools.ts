/**
 * Registro das ferramentas MCP da fonte CATMAT/CATSER.
 *
 * Tools (nomes exatos da sintese):
 *   buscar_material        - FTS sobre descricaoItem (CATMAT)
 *   buscar_servico         - FTS sobre nomeServico (CATSER)
 *   resolver_catmat_catser - codigo -> descricao + hierarquia
 *   normalizar_item_edital - descricao livre -> CATMAT/CATSER mais provaveis
 *
 * Extras de operacao: indexar_catmat_catser e status_catmat_catser.
 */

import type { Database } from "bun:sqlite";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, panic } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { dbExists, openReadonly } from "../../core/store/sqlite-store";
import { DB_FILE, DOMINIO } from "./catalog";
import { catmatCatserErrors } from "./errors";
import { catmatCatserIndexAdapter, dbPath } from "./indexer";
import {
  buscarMaterial,
  buscarServico,
  normalizarItemEdital,
  resolverCatmatCatser,
} from "./service";

const buscarInputSchema = z
  .object({
    termo: z.string().trim().min(1),
    limite: z.number().int().positive().max(100).optional(),
  })
  .strict();

const resolverInputSchema = z
  .object({
    codigo: z.number().int().positive(),
    tipo: z.enum(["material", "servico"]).optional(),
  })
  .strict();

const normalizarInputSchema = z
  .object({
    descricao: z.string().trim().min(1),
    limite: z.number().int().positive().max(100).optional(),
  })
  .strict();

const emptyInputSchema = z.object({}).strict();

export function registerCatmatCatserTools(server: McpServer) {
  server.registerTool(
    "buscar_material",
    {
      description:
        "Busca materiais do CATMAT por nome/descricao (FTS local sobre descricaoItem). A API oficial nao oferece busca textual util; este indice local resolve por nome.",
      inputSchema: buscarInputSchema,
    },
    async (args) => toolContent(callTool("buscar_material", args))
  );

  server.registerTool(
    "buscar_servico",
    {
      description:
        "Busca servicos do CATSER por nome (FTS local sobre nomeServico).",
      inputSchema: buscarInputSchema,
    },
    async (args) => toolContent(callTool("buscar_servico", args))
  );

  server.registerTool(
    "resolver_catmat_catser",
    {
      description:
        "Resolve um codigoItem (CATMAT) ou codigoServico (CATSER) para descricao e hierarquia. Material: Grupo>Classe>PDM>Item. Servico: Secao>Divisao>Grupo>Classe>Subclasse>Servico.",
      inputSchema: resolverInputSchema,
    },
    async (args) => toolContent(callTool("resolver_catmat_catser", args))
  );

  server.registerTool(
    "normalizar_item_edital",
    {
      description:
        "Recebe uma descricao livre de item de edital e devolve os CATMAT/CATSER mais provaveis (FTS) para deduplicar e casar com PNCP.",
      inputSchema: normalizarInputSchema,
    },
    async (args) => toolContent(callTool("normalizar_item_edital", args))
  );

  server.registerTool(
    "status_catmat_catser",
    {
      description:
        "Mostra o status e caminho do indice local CATMAT/CATSER neste computador.",
      inputSchema: emptyInputSchema,
    },
    async () =>
      toolContent(Result.serialize(await catmatCatserIndexAdapter.status()))
  );

  server.registerTool(
    "indexar_catmat_catser",
    {
      description:
        "Pagina a API Compras.gov.br e recria o indice local CATMAT/CATSER (SQLite + FTS5) neste computador.",
      inputSchema: emptyInputSchema,
    },
    async () =>
      toolContent(Result.serialize(await catmatCatserIndexAdapter.build()))
  );
}

/** Resolve as tools que dependem do banco local, abrindo-o sob demanda. */
function callTool(name: string, args: unknown) {
  if (name === "buscar_material") {
    const input = parseInput(buscarInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      buscarMaterial(db, input.value.termo, input.value.limite)
    );
  }

  if (name === "buscar_servico") {
    const input = parseInput(buscarInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      buscarServico(db, input.value.termo, input.value.limite)
    );
  }

  if (name === "resolver_catmat_catser") {
    const input = parseInput(resolverInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      resolverCatmatCatser(db, input.value.codigo, input.value.tipo)
    );
  }

  if (name === "normalizar_item_edital") {
    const input = parseInput(normalizarInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return withDb((db) =>
      normalizarItemEdital(db, input.value.descricao, input.value.limite)
    );
  }

  return panic(`Ferramenta CATMAT/CATSER nao encontrada: ${name}`);
}

/** Abre o banco (singleton) e executa a consulta; erro claro se nao indexado. */
function withDb<T>(fn: (db: Database) => T) {
  if (!dbExists(DOMINIO, DB_FILE)) {
    return Result.serialize(
      Result.err(catmatCatserErrors.INDICE_AUSENTE({ path: dbPath() }))
    );
  }

  const db = openReadonly(DOMINIO, DB_FILE);

  return Result.serialize(Result.ok(fn(db)));
}

function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    catmatCatserErrors.ENTRADA_INVALIDA({
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
