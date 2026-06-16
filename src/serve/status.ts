import { Effect, Schema } from "effect";
import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Db } from "../kernel/db/client";
import { ata } from "../kernel/db/schemas/ata";
import { bem } from "../kernel/db/schemas/bem";
import { candidato } from "../kernel/db/schemas/candidato";
import { capagEstado } from "../kernel/db/schemas/capag-estado";
import { capagMunicipio } from "../kernel/db/schemas/capag-municipio";
import { catmatMaterial } from "../kernel/db/schemas/catmat-material";
import { catserService } from "../kernel/db/schemas/catser-service";
import { cnae } from "../kernel/db/schemas/cnae";
import { contratacao } from "../kernel/db/schemas/contratacao";
import { contrato } from "../kernel/db/schemas/contrato";
import { cota } from "../kernel/db/schemas/despesa-camara";
import { deputado } from "../kernel/db/schemas/deputado";
import { despesa } from "../kernel/db/schemas/despesa";
import { diario } from "../kernel/db/schemas/diario";
import { diarioCnpj } from "../kernel/db/schemas/diario-cnpj";
import { dominio } from "../kernel/db/schemas/dominio";
import { empresa } from "../kernel/db/schemas/empresa";
import { estabelecimento } from "../kernel/db/schemas/estabelecimento";
import { fornecedor } from "../kernel/db/schemas/fornecedor";
import { node } from "../kernel/db/schemas/legislacao";
import { municipio } from "../kernel/db/schemas/municipio";
import { proposicao } from "../kernel/db/schemas/proposicao";
import { proposicaoAutor } from "../kernel/db/schemas/proposicao-autor";
import { receita } from "../kernel/db/schemas/receita";
import { receitaOriginario } from "../kernel/db/schemas/receita-originario";
import { sancao } from "../kernel/db/schemas/sancao";
import { siconfiEnte } from "../kernel/db/schemas/siconfi-ente";
import { simples } from "../kernel/db/schemas/simples";
import { socio } from "../kernel/db/schemas/socio";
import { tcuInidoneo } from "../kernel/db/schemas/tcu-inidoneo";
import { defineTool } from "./tool";

const layout = {
  legislacao: { node },
  "ibge-localidades": { municipio },
  cnae: { cnae },
  "catmat-catser": { catmatMaterial, catserService },
  "sicaf-fornecedores": { fornecedor },
  "sancoes-cgu": { sancao },
  "receita-cnpj": { empresa, estabelecimento, socio, simples, dominio },
  "tse-eleitoral": { candidato, bem, receita, despesa, receitaOriginario },
  "camara-deputados": { deputado, cota, proposicao, proposicaoAutor },
  "querido-diario": { diario, diarioCnpj },
  capag: { capagEstado, capagMunicipio, siconfiEnte },
  pncp: { contratacao, contrato, ata },
  "tcu-inidoneos": { tcuInidoneo },
} satisfies Record<string, Record<string, PgTable>>;

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
      Object.entries(layout),
      ([fonte, tables]) =>
        countFonte(tables).pipe(
          Effect.map((contagens) => [fonte, contagens] as const)
        ),
      { concurrency: 2 }
    ).pipe(Effect.map((entries) => Object.fromEntries(entries))),
});
