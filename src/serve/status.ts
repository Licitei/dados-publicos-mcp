import { Effect, Schema } from "effect";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Db } from "../kernel/db/client";
import { tableGroupsBySource } from "../kernel/db/schema-registry";
import { defineTool } from "./tool";

const countRows = (table: PgTable) =>
  Db.pipe(
    Effect.flatMap((db) =>
      db.execute(sql`select count(*)::int as count from ${table}`)
    ),
    Effect.map((rows) => Number(rows[0]?.count ?? 0)),
    Effect.catchCause(() => Effect.succeed(0))
  );

const countFonte = (tables: Record<string, PgTable>) =>
  Effect.forEach(
    Object.entries(tables),
    ([tabela, table]) =>
      countRows(table).pipe(Effect.map((count) => [tabela, count] as const)),
    { concurrency: 2 }
  ).pipe(Effect.map((entries) => Object.fromEntries(entries)));

const StatusInput = Schema.Struct({});

export const statusIndices = defineTool({
  name: "status_indices",
  description:
    "Lista o status de todos os indices locais (dominios) do servidor: contagem de registros por tabela de cada fonte.",
  input: StatusInput,
  run: () =>
    Effect.forEach(
      Object.entries(tableGroupsBySource),
      ([fonte, tables]) =>
        countFonte(tables).pipe(
          Effect.map((contagens) => [fonte, contagens] as const)
        ),
      { concurrency: 2 }
    ).pipe(Effect.map((entries) => Object.fromEntries(entries))),
});
