import { Result, type Result as ResultType } from "better-result";
import dayjs from "dayjs";
import type { EvlogError } from "evlog";
import { normalizeCnpj } from "../../core/normalize";
import { dadosPublicosErrors } from "./errors";

export { normalizeCnpj };

export type PncpId = {
  orgaoCnpj: string;
  ano: number;
  sequencial: number;
};

const pncpIdPattern = /^(\d{14})-\d+-(\d+)\/(\d{4})$/;

/**
 * Faz parse do numeroControlePNCP. Entrada fora do formato e uma FALHA
 * RECUPERAVEL (vem do usuario), entao retornamos o EvlogError do catalogo no
 * canal de erro do Result em vez de lancar.
 */
export function parseNumeroControlePncp(
  input: string,
): ResultType<PncpId, EvlogError> {
  const match = input.match(pncpIdPattern);

  if (!match) {
    return Result.err(
      dadosPublicosErrors.NUMERO_CONTROLE_INVALIDO({ valor: input }),
    );
  }

  return Result.ok({
    orgaoCnpj: match[1] as string,
    sequencial: Number.parseInt(match[2] as string, 10),
    ano: Number.parseInt(match[3] as string, 10),
  });
}

export function resolvePncpId(input: {
  numeroControlePNCP?: string;
  orgaoCnpj?: string;
  ano?: number;
  sequencial?: number;
}): ResultType<PncpId, EvlogError> {
  if (input.numeroControlePNCP) {
    return parseNumeroControlePncp(input.numeroControlePNCP);
  }

  if (!input.orgaoCnpj || !input.ano || !input.sequencial) {
    return Result.err(dadosPublicosErrors.IDENTIFICADOR_AUSENTE());
  }

  return Result.ok({
    orgaoCnpj: normalizeCnpj(input.orgaoCnpj),
    ano: input.ano,
    sequencial: input.sequencial,
  });
}

export function defaultDateRange(days: number) {
  return {
    dataInicial: dayjs().subtract(days, "day").format("YYYYMMDD"),
    dataFinal: dayjs().format("YYYYMMDD"),
  };
}

/**
 * Valida uma data no formato PNCP (YYYYMMDD). Formato invalido e uma FALHA
 * RECUPERAVEL de entrada: retorna Result.err do catalogo em vez de lancar.
 */
export function assertPncpDate(
  value: string,
  field: string,
): ResultType<true, EvlogError> {
  if (!/^\d{8}$/.test(value)) {
    return Result.err(dadosPublicosErrors.DATA_INVALIDA({ campo: field }));
  }

  const parsed = dayjs(
    `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`,
  );

  if (!parsed.isValid() || parsed.format("YYYYMMDD") !== value) {
    return Result.err(dadosPublicosErrors.DATA_INVALIDA({ campo: field }));
  }

  return Result.ok(true as const);
}

export function splitDateBuckets(input: {
  dataInicial: string;
  dataFinal: string;
  granularidade: "dia" | "semana" | "mes" | "ano";
}) {
  const unitByGranularity = {
    dia: "day",
    semana: "week",
    mes: "month",
    ano: "year",
  } as const;
  const unit = unitByGranularity[input.granularidade];
  const end = dayjs(input.dataFinal, "YYYYMMDD");
  const buckets = [];
  let cursor = dayjs(input.dataInicial, "YYYYMMDD");

  while (cursor.isBefore(end) || cursor.isSame(end, "day")) {
    const bucketStart = cursor;
    const bucketEnd = cursor.endOf(unit).isAfter(end)
      ? end
      : cursor.endOf(unit);

    buckets.push({
      chave: bucketStart.format(
        input.granularidade === "ano"
          ? "YYYY"
          : input.granularidade === "mes"
            ? "YYYY-MM"
            : "YYYY-MM-DD",
      ),
      dataInicial: bucketStart.format("YYYYMMDD"),
      dataFinal: bucketEnd.format("YYYYMMDD"),
    });

    cursor = bucketEnd.add(1, "day");
  }

  return buckets;
}

export function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;

  if (data && typeof data === "object" && "data" in data) {
    const value = (data as { data?: unknown }).data;

    if (Array.isArray(value)) return value;
  }

  return [];
}

export function pageData(data: unknown) {
  const object =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};

  return {
    data: asArray(data),
    totalRegistros:
      typeof object.totalRegistros === "number" ? object.totalRegistros : null,
    totalPaginas:
      typeof object.totalPaginas === "number" ? object.totalPaginas : null,
    numeroPagina:
      typeof object.numeroPagina === "number" ? object.numeroPagina : null,
  };
}

export function filterByKeyword(data: unknown[], keyword?: string) {
  if (!keyword) return data;

  const normalized = keyword.toLowerCase();

  return data.filter((item) =>
    JSON.stringify(item).toLowerCase().includes(normalized),
  );
}

export function sumValues(data: unknown[]) {
  return data.reduce<number>((sum, item) => sum + valueFromItem(item), 0);
}

function valueFromItem(item: unknown) {
  if (!item || typeof item !== "object") return 0;

  const record = item as Record<string, unknown>;
  const value =
    record.valorTotalEstimado ??
    record.valorTotalHomologado ??
    record.valorInicial ??
    record.valorGlobal ??
    record.valorTotal;

  return typeof value === "number" ? value : 0;
}
