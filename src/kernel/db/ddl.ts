import { is, sql, type SQL } from "drizzle-orm";
import {
  getTableConfig,
  IndexedColumn,
  type PgColumn,
  type PgTable,
} from "drizzle-orm/pg-core";

const columnDdl = (column: PgColumn) =>
  `${column.name} ${column.getSQLType()}${column.primary ? " primary key" : column.notNull ? " not null" : ""}`;

const indexColumnDdl = (column: Partial<IndexedColumn | SQL>) =>
  is(column, IndexedColumn) && column.indexConfig.opClass
    ? `${column.name} ${column.indexConfig.opClass}`
    : is(column, IndexedColumn)
      ? column.name
      : "";

const withDdl = (params: Record<string, unknown> | undefined) =>
  params && Object.keys(params).length
    ? ` with (${Object.entries(params)
        .map(([key, value]) => `${key}='${value}'`)
        .join(", ")})`
    : "";

const usingDdl = (method: string | undefined) =>
  method && method !== "btree" ? ` using ${method}` : "";

export const tableDdl = (table: PgTable) => {
  const config = getTableConfig(table);
  const columns = config.columns.map(columnDdl).join(", ");
  const createTable = sql.raw(
    `create table if not exists "${config.name}" (${columns})`
  );
  const createIndexes = config.indexes.map((entry) =>
    sql.raw(
      `create index if not exists "${entry.config.name}" on "${config.name}"${usingDdl(
        entry.config.method
      )} (${entry.config.columns.map(indexColumnDdl).join(", ")})${withDdl(
        entry.config.with
      )}`
    )
  );
  return [createTable, ...createIndexes];
};
