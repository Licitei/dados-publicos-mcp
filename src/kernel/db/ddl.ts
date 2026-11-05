import { is, sql, type SQL } from "drizzle-orm";
import * as Arr from "effect/Array";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Rec from "effect/Record";
import {
  getTableConfig,
  IndexedColumn,
  type PgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";

const columnDdl = (column: PgColumn) =>
  `${column.name} ${column.getSQLType()}${column.primary ? " primary key" : column.notNull ? " not null" : ""}`;

const indexColumnDdl = (column: Partial<IndexedColumn | SQL>) =>
  is(column, IndexedColumn) &&
  column.indexConfig.opClass !== undefined &&
  column.indexConfig.opClass !== ""
    ? `${column.name} ${column.indexConfig.opClass}`
    : is(column, IndexedColumn)
      ? column.name
      : "";

const withDdl = (params: Record<string, unknown> | undefined) =>
  pipe(
    Option.fromNullishOr(params),
    Option.filter((found) => Rec.size(found) > 0),
    Option.match({
      onNone: () => "",
      onSome: (found) =>
        ` with (${pipe(
          Rec.toEntries(found),
          Arr.map(([key, value]) => `${key}='${value}'`),
          Arr.join(", ")
        )})`,
    })
  );

const usingDdl = (method: string | undefined) =>
  method !== undefined && method !== "btree" ? ` using ${method}` : "";

export const tableDdlText = (table: PgTable): readonly string[] => {
  const config = getTableConfig(table);
  const columns = pipe(config.columns, Arr.map(columnDdl), Arr.join(", "));
  const createTable = `create table if not exists "${config.name}" (${columns})`;
  const createIndexes = pipe(
    config.indexes,
    Arr.map(
      (entry) =>
        `create index if not exists "${entry.config.name}" on "${config.name}"${usingDdl(
          entry.config.method
        )} (${pipe(entry.config.columns, Arr.map(indexColumnDdl), Arr.join(", "))})${withDdl(
          entry.config.with
        )}`
    )
  );
  return [createTable, ...createIndexes];
};

export const tableDdl = (table: PgTable): readonly SQL[] =>
  pipe(
    tableDdlText(table),
    Arr.map((statement) => sql.raw(statement))
  );
