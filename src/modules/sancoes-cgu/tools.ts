/**
 * Registra as ferramentas MCP do modulo de sancoes da CGU.
 *
 * Tools de busca (verificar_sancoes, buscar_sancionado_por_nome,
 * sancoes_vigentes_na_data) abrem o banco em disco e delegam ao service.
 * Tambem expoe indexar_sancoes (build) e status_sancoes.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Result, panic } from "better-result";
import type { EvlogError } from "evlog";
import { z } from "zod";
import { dbExists, openDb } from "../../core/store/sqlite-store";
import { dominioPath } from "../../core/dataDir";
import { DB_FILE, DOMINIO, type DatasetKey } from "./catalog";
import { sancoesCguErrors } from "./errors";
import { sancoesCguIndexAdapter } from "./indexer";
import { createSchema } from "./schema";
import {
  buscarSancionadoPorNome,
  sancoesVigentesNaData,
  verificarSancoes,
} from "./service";

const verificarSancoesInputSchema = z
  .object({
    documento: z
      .string()
      .trim()
      .min(1)
      .describe("CNPJ (14 digitos) ou CPF (11 digitos), com ou sem pontuacao"),
  })
  .strict();

const buscarPorNomeInputSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(2)
      .describe("Nome ou razao social a buscar (sem acento e maiusculas tanto faz)"),
    limite: z.number().int().positive().max(500).optional(),
  })
  .strict();

const listaEnum = z.enum([
  "ceis",
  "cnep",
  "ceaf",
  "cepim",
  "acordos-leniencia",
]);

const vigentesInputSchema = z
  .object({
    data: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Use o formato AAAA-MM-DD"),
    lista: listaEnum.optional(),
    limite: z.number().int().positive().max(500).optional(),
  })
  .strict();

const emptyInputSchema = z.object({}).strict();

export function registerSancoesCguTools(server: McpServer): void {
  server.registerTool(
    "verificar_sancoes",
    {
      description:
        "Verifica se um CNPJ ou CPF esta sancionado/inidoneo, cruzando CEIS+CNEP+CEPIM+CEAF+Leniencia numa unica consulta. Sinaliza inidoneidade/impedimento.",
      inputSchema: verificarSancoesInputSchema,
    },
    async (args) =>
      toolContent(await callSancoesCguTool("verificar_sancoes", args))
  );

  server.registerTool(
    "buscar_sancionado_por_nome",
    {
      description:
        "Busca sancionados (empresa ou pessoa) por nome / razao social nas 5 listas, usando indice de texto (FTS).",
      inputSchema: buscarPorNomeInputSchema,
    },
    async (args) =>
      toolContent(await callSancoesCguTool("buscar_sancionado_por_nome", args))
  );

  server.registerTool(
    "sancoes_vigentes_na_data",
    {
      description:
        "Lista sancoes ativas numa data (intervalo data inicio/final) - due diligence na data do certame.",
      inputSchema: vigentesInputSchema,
    },
    async (args) =>
      toolContent(await callSancoesCguTool("sancoes_vigentes_na_data", args))
  );

  server.registerTool(
    "status_sancoes",
    {
      description:
        "Mostra o status e o caminho do indice local de sancoes da CGU.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(await callSancoesCguTool("status_sancoes", args))
  );

  server.registerTool(
    "indexar_sancoes",
    {
      description:
        "Baixa os snapshots diarios da CGU (CEIS/CNEP/CEAF/CEPIM/Acordos) e recria o indice local neste computador.",
      inputSchema: emptyInputSchema,
    },
    async (args) =>
      toolContent(await callSancoesCguTool("indexar_sancoes", args))
  );
}

export async function callSancoesCguTool(name: string, args: unknown) {
  if (name === "verificar_sancoes") {
    const input = parseToolInput(verificarSancoesInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(
      withDb((db) => verificarSancoes(db, input.value.documento))
    );
  }

  if (name === "buscar_sancionado_por_nome") {
    const input = parseToolInput(buscarPorNomeInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(
      withDb((db) =>
        buscarSancionadoPorNome(db, input.value.nome, input.value.limite)
      )
    );
  }

  if (name === "sancoes_vigentes_na_data") {
    const input = parseToolInput(vigentesInputSchema, args);

    if (Result.isError(input)) return Result.serialize(input);

    return Result.serialize(
      withDb((db) =>
        sancoesVigentesNaData(db, input.value.data, {
          lista: input.value.lista as DatasetKey | undefined,
          limite: input.value.limite,
        })
      )
    );
  }

  if (name === "status_sancoes") {
    return Result.serialize(await sancoesCguIndexAdapter.status());
  }

  if (name === "indexar_sancoes") {
    return Result.serialize(await sancoesCguIndexAdapter.build());
  }

  return panic(`Ferramenta de sancoes-cgu nao encontrada: ${name}`);
}

/** Abre o banco em disco, exige que o indice exista e roda fn. */
function withDb<T>(fn: (db: import("bun:sqlite").Database) => T) {
  if (!dbExists(DOMINIO, DB_FILE)) {
    return Result.err(
      sancoesCguErrors.INDICE_AUSENTE({ path: dominioPath(DOMINIO, DB_FILE) })
    );
  }

  const db = openDb(DOMINIO, DB_FILE);

  createSchema(db);

  return Result.ok(fn(db));
}

function parseToolInput<TSchema extends z.ZodType>(
  schema: TSchema,
  args: unknown
): Result<z.infer<TSchema>, EvlogError> {
  const parsed = schema.safeParse(args);

  if (parsed.success) return Result.ok(parsed.data);

  return Result.err(
    sancoesCguErrors.ENTRADA_INVALIDA({
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
