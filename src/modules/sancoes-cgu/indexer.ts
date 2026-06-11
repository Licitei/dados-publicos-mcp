/**
 * Indexador das sancoes da CGU: baixa os snapshots diarios do CDN, descompacta,
 * parseia e grava no SQLite local. Expoe o IndexAdapter do modulo.
 *
 * Cadencia: cada dataset publica um arquivo por DATA (YYYYMMDD). Nao ha link
 * "latest"; comecamos em D-1 e regredimos ate achar HTTP 200 (403 = arquivo
 * inexistente naquela data). Nem todo dataset sai todo dia (CEPIM costuma
 * atrasar 1 dia). Snapshot e COMPLETO => TRUNCATE + INSERT em transacao.
 *
 * O download/IO fica isolado aqui; o parsing (parse.ts) e a busca (service.ts)
 * sao puros e testados sem rede.
 */
import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import type {
  AdapterError,
  BuildOptions,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { dominioPath } from "../../core/dataDir";
import { unzipEntries } from "../../core/parse/zip";
import { dbExists, openDb } from "../../core/store/sqlite-store";
import {
  DATASETS,
  DB_FILE,
  DOMINIO,
  TITULO,
  zipUrl,
  type DatasetSpec,
} from "./catalog";
import { sancoesCguErrors } from "./errors";
import { parseEfeitos, parseSancoes, type SancaoRow } from "./parse";
import {
  createSchema,
  getMeta,
  insertEfeitos,
  insertSancoes,
  rebuildFts,
  setMeta,
  totalSancoes,
  truncateAll,
} from "./schema";

/** Quantos dias regredir a partir de D-1 procurando o snapshot mais recente. */
const MAX_LOOKBACK_DAYS = 7;

/** Status HTTP que significam "tente a data anterior" (arquivo inexistente). */
const STATUS_INEXISTENTE = new Set([403, 404]);

export const sancoesCguIndexAdapter: IndexAdapter = {
  key: DOMINIO,
  titulo: TITULO,
  storage: "sqlite",
  requiresHeavyDownload: false,
  async build(
    opts?: BuildOptions
  ): Promise<ResultType<BuildSummary, AdapterError>> {
    return build(opts);
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    return status();
  },
};

async function build(
  opts?: BuildOptions
): Promise<ResultType<BuildSummary, EvlogError>> {
  const onProgress = opts?.onProgress ?? (() => {});
  const todasSancoes: SancaoRow[] = [];
  const efeitos: ReturnType<typeof parseEfeitos> = [];
  const detalhes: Record<string, unknown> = {};

  for (const dataset of DATASETS) {
    onProgress(`Baixando ${dataset.label}...`);

    const baixado = await baixarDataset(dataset);

    if (Result.isError(baixado)) return baixado;

    const { bytes, dataUsada } = baixado.value;

    const processado = processarZip(dataset, bytes);

    if (Result.isError(processado)) return processado;

    todasSancoes.push(...processado.value.sancoes);
    efeitos.push(...processado.value.efeitos);

    detalhes[dataset.key] = {
      data: dataUsada,
      registros: processado.value.sancoes.length,
      efeitos: processado.value.efeitos.length,
    };

    onProgress(
      `${dataset.label}: ${processado.value.sancoes.length} registros (${dataUsada}).`
    );
  }

  onProgress("Gravando no SQLite...");

  return gravar(todasSancoes, efeitos, detalhes);
}

function gravar(
  todasSancoes: SancaoRow[],
  efeitos: ReturnType<typeof parseEfeitos>,
  detalhes: Record<string, unknown>
): ResultType<BuildSummary, EvlogError> {
  return Result.try({
    try: () => {
      const db = openDb(DOMINIO, DB_FILE);

      try {
        createSchema(db);

        db.transaction(() => {
          truncateAll(db);
          insertSancoes(db, todasSancoes);
          insertEfeitos(db, efeitos);
          rebuildFts(db);
        })();

        const atualizadoEm = new Date().toISOString();

        setMeta(db, "atualizadoEm", atualizadoEm);
        setMeta(db, "registros", String(todasSancoes.length));

        return {
          dominio: DOMINIO,
          registros: totalSancoes(db),
          atualizadoEm,
          caminho: dominioPath(DOMINIO, DB_FILE),
          detalhes,
        } satisfies BuildSummary;
      } finally {
        db.close();
      }
    },
    catch: (cause): EvlogError =>
      sancoesCguErrors.PARSE({
        dataset: DOMINIO,
        internal: { cause: String(cause) },
      }),
  });
}

async function status(): Promise<ResultType<StatusInfo, EvlogError>> {
  const caminho = dominioPath(DOMINIO, DB_FILE);
  const existe = dbExists(DOMINIO, DB_FILE);

  if (!existe) {
    return Result.ok({
      key: DOMINIO,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: false,
      atualizadoEm: null,
      registros: null,
      caminho,
    });
  }

  const db = openDb(DOMINIO, DB_FILE);

  try {
    createSchema(db);

    return Result.ok({
      key: DOMINIO,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: true,
      atualizadoEm: getMeta(db, "atualizadoEm"),
      registros: totalSancoes(db) || null,
      caminho,
    });
  } finally {
    db.close();
  }
}

/**
 * Baixa o zip de um dataset comecando em D-1 e regredindo ate HTTP 200.
 * 403/404 e tratado como "arquivo inexistente naquela data" e dispara a
 * regressao; outros erros (rede/status) abortam a busca daquele dataset.
 */
async function baixarDataset(
  dataset: DatasetSpec
): Promise<
  ResultType<{ bytes: Uint8Array; dataUsada: string }, EvlogError>
> {
  for (let offset = 1; offset <= MAX_LOOKBACK_DAYS; offset++) {
    const yyyymmdd = diaAtrasFrom(new Date(), offset);
    const url = zipUrl(dataset, yyyymmdd);

    const tentativa = await baixarUrl(url);

    if (Result.isOk(tentativa)) {
      // null = arquivo inexistente naquela data (403/404): regride mais um dia.
      if (tentativa.value === null) continue;

      return Result.ok({ bytes: tentativa.value, dataUsada: yyyymmdd });
    }

    // Erro de rede ou status nao-regressivo: aborta a busca deste dataset.
    return tentativa;
  }

  return Result.err(
    sancoesCguErrors.SNAPSHOT_AUSENTE({
      dataset: dataset.key,
      dias: MAX_LOOKBACK_DAYS,
    })
  );
}

/**
 * Baixa uma URL especifica. Resolve com os bytes (200), com `null` quando o
 * arquivo nao existe naquela data (403/404), ou erra (rede/status) caso
 * contrario. Le `response.status` direto para decidir a regressao sem precisar
 * introspeccionar o canal de erro (o status HTTP nao e um campo tipado do
 * EvlogError).
 */
async function baixarUrl(
  url: string
): Promise<ResultType<Uint8Array | null, EvlogError>> {
  return Result.gen(async function* () {
    const response = yield* Result.await(
      Result.tryPromise({
        try: () => fetch(url, { signal: AbortSignal.timeout(30_000) }),
        catch: (cause): EvlogError =>
          sancoesCguErrors.FETCH({ url, internal: { cause: String(cause) } }),
      })
    );

    if (response.ok) {
      const bytes = yield* Result.await(
        Result.tryPromise({
          try: async () => new Uint8Array(await response.arrayBuffer()),
          catch: (cause): EvlogError =>
            sancoesCguErrors.FETCH({
              url,
              internal: { cause: String(cause) },
            }),
        })
      );

      return Result.ok<Uint8Array | null>(bytes);
    }

    // 403/404 = arquivo inexistente naquela data: sinaliza regressao.
    if (STATUS_INEXISTENTE.has(response.status)) {
      return Result.ok<Uint8Array | null>(null);
    }

    return yield* Result.err(
      sancoesCguErrors.FETCH({ url, internal: { httpStatus: response.status } })
    );
  });
}

type ZipConteudo = {
  sancoes: SancaoRow[];
  efeitos: ReturnType<typeof parseEfeitos>;
};

/** Descompacta e parseia o(s) CSV(s) de um dataset. */
function processarZip(
  dataset: DatasetSpec,
  zip: Uint8Array
): ResultType<ZipConteudo, EvlogError> {
  return Result.gen(function* () {
    const conteudo = yield* extrairCsvs(dataset, zip);

    if (conteudo.csvEntries.length === 0) {
      return yield* Result.err(
        sancoesCguErrors.PARSE({ dataset: dataset.key })
      );
    }

    return parsearEntries(dataset, conteudo.csvEntries);
  });
}

type CsvEntry = ReturnType<typeof unzipEntries>[number];

/** Descompacta o zip e isola os CSVs internos (IO que pode lancar). */
function extrairCsvs(
  dataset: DatasetSpec,
  zip: Uint8Array
): ResultType<{ csvEntries: CsvEntry[] }, EvlogError> {
  return Result.try({
    try: () => {
      const entries = unzipEntries(zip);
      const csvEntries = entries.filter((entry) =>
        entry.name.toLowerCase().endsWith(".csv")
      );

      return { csvEntries };
    },
    catch: (cause): EvlogError =>
      sancoesCguErrors.PARSE({
        dataset: dataset.key,
        internal: { cause: String(cause) },
      }),
  });
}

/** Parseia os CSVs ja isolados em SancaoRow[] (+ efeitos, para acordos). */
function parsearEntries(
  dataset: DatasetSpec,
  csvEntries: CsvEntry[]
): ResultType<ZipConteudo, EvlogError> {
  return Result.try({
    try: () => {
      const sancoes: SancaoRow[] = [];
      let efeitos: ReturnType<typeof parseEfeitos> = [];

      for (const entry of csvEntries) {
        const lower = entry.name.toLowerCase();

        if (dataset.key === "acordos-leniencia" && lower.includes("efeito")) {
          efeitos = parseEfeitos(entry.bytes());

          continue;
        }

        sancoes.push(...parseSancoes(dataset.key, entry.bytes()));
      }

      return { sancoes, efeitos };
    },
    catch: (cause): EvlogError =>
      sancoesCguErrors.PARSE({
        dataset: dataset.key,
        internal: { cause: String(cause) },
      }),
  });
}

/** YYYYMMDD de `offset` dias antes da data base (UTC). */
function diaAtrasFrom(base: Date, offset: number): string {
  const d = new Date(base.getTime());

  d.setUTCDate(d.getUTCDate() - offset);

  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}
