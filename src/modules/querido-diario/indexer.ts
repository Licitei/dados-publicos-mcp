import { Result, type Result as ResultType } from "better-result";
import type { EvlogError } from "evlog";
import type {
  AdapterError,
  BuildOptions,
  BuildSummary,
  IndexAdapter,
  StatusInfo,
} from "../../core/adapter";
import { fetchJson } from "../../core/http/download";
import { fetchWithRetry } from "../../core/http/download";
import { unzipEntries } from "../../core/parse/zip";
import { openDb, countRows } from "../../core/store/sqlite-store";
import { statSync } from "node:fs";
import {
  buildAggregateZipUrl,
  buildAggregatesApiUrl,
  key as DOMINIO,
  titulo,
  UFS_COM_DADOS,
  type AggregatesResponse,
} from "./catalog";
import { queridoDiarioErrors } from "./errors";
import { parseMunicipioXml } from "./parse";
import { createSchema, DB_FILE, insertDiarios } from "./store";
import { dbExistsOnDisk, dbPath } from "./service";

/** Canal de erro do indexer: EvlogError do catalogo `querido-diario`. */
export type QdIndexError = EvlogError;

/** Escopo de build: recorte por UFs e anos via BuildOptions.scope. */
export type QdScope = {
  ufs?: string[];
  anos?: number[];
};

function readScope(opts?: BuildOptions): QdScope {
  const scope = (opts?.scope ?? {}) as Record<string, unknown>;
  const ufs = Array.isArray(scope.ufs)
    ? scope.ufs.map((u) => String(u).toUpperCase())
    : undefined;
  const anos = Array.isArray(scope.anos)
    ? scope.anos.map((a) => Number(a)).filter((a) => Number.isFinite(a))
    : undefined;

  return { ufs, anos };
}

/**
 * Resolve os anos efetivos do escopo.
 *
 * DEFAULT-2026: sem a flag --anos (scope.anos vazio), o build indexa SOMENTE o
 * ano corrente desta fonte. O ano e dinamico (new Date().getFullYear(), runtime)
 * para nao virar magic-number ao virar o ano. A flag --anos sobrepoe o default.
 */
function anosEfetivos(scope: QdScope): number[] | undefined {
  if (scope.anos && scope.anos.length > 0) return scope.anos;

  return [new Date().getFullYear()];
}

/** Descobre os pares UF/ano disponiveis para as UFs do escopo (via API). */
async function descobrirAlvos(
  scope: QdScope,
  onProgress?: (msg: string) => void
): Promise<ResultType<{ uf: string; ano: number }[], QdIndexError>> {
  return Result.gen(async function* () {
    // DEFAULT-2026: sem --ufs => todas as UFs com dados; sem --anos => ano corrente.
    const ufs = scope.ufs ?? [...UFS_COM_DADOS];
    const anos = anosEfetivos(scope);
    const alvos: { uf: string; ano: number }[] = [];

    for (const uf of ufs) {
      if (uf === "AC") continue; // AC nao tem dados (404)

      const url = buildAggregatesApiUrl(uf);

      onProgress?.(`Descobrindo arquivos de ${uf}...`);

      const res = await fetchJson<AggregatesResponse>(url);

      if (Result.isError(res)) {
        // 404 numa UF sem dados nao deve abortar o build inteiro.
        if (res.error.status === 404) continue;

        return yield* Result.err(
          queridoDiarioErrors.FONTE_DOWNLOAD({
            url,
            internal: { cause: res.error.message },
          })
        );
      }

      const aggregates = res.value?.aggregates ?? [];

      for (const agg of aggregates) {
        if (anos && !anos.includes(agg.year)) continue;

        alvos.push({ uf, ano: agg.year });
      }
    }

    return Result.ok(alvos);
  });
}

/**
 * Baixa um ZIP UF/ano, descompacta, parseia cada XML de municipio e grava no
 * SQLite. Retorna a quantidade de diarios inseridos. O download de verdade so
 * acontece quando o usuario roda o build (HEAVY).
 */
async function indexarAlvo(
  db: ReturnType<typeof openDb>,
  uf: string,
  ano: number,
  onProgress?: (msg: string) => void
): Promise<ResultType<number, QdIndexError>> {
  const url = buildAggregateZipUrl(uf, ano);

  onProgress?.(`Baixando ${uf}_${ano}.zip...`);

  const fetched = await Result.tryPromise({
    try: async () => {
      const response = await fetchWithRetry(url, undefined, {
        timeoutMs: 600_000,
        retries: 2,
      });

      return new Uint8Array(await response.arrayBuffer());
    },
    catch: (cause): EvlogError =>
      queridoDiarioErrors.FONTE_DOWNLOAD({
        url,
        internal: { cause: String(cause) },
      }),
  });

  if (Result.isError(fetched)) return fetched;

  onProgress?.(`Descompactando e indexando ${uf}_${ano}...`);

  const parsed = Result.try({
    try: () => {
      let total = 0;

      for (const entry of unzipEntries(fetched.value)) {
        if (!entry.name.toLowerCase().endsWith(".xml")) continue;

        const xml = new TextDecoder("utf-8", { fatal: false }).decode(
          entry.bytes()
        );
        const registros = parseMunicipioXml(xml);

        total += insertDiarios(db, registros);
      }

      return total;
    },
    catch: (cause): EvlogError =>
      queridoDiarioErrors.FONTE_PARSE({
        url,
        internal: { cause: String(cause) },
      }),
  });

  return parsed;
}

/**
 * Build completo do indice (HEAVY). Estruturado em funcoes puras testaveis
 * (parseMunicipioXml, insertDiarios) — aqui apenas orquestra rede + disco.
 */
export async function buildQueridoDiario(
  opts?: BuildOptions
): Promise<ResultType<BuildSummary, QdIndexError>> {
  const scope = readScope(opts);
  const onProgress = opts?.onProgress;

  const alvos = await descobrirAlvos(scope, onProgress);

  if (Result.isError(alvos)) return alvos;

  const db = openDb(DOMINIO, DB_FILE);
  createSchema(db);

  let total = 0;

  try {
    for (const { uf, ano } of alvos.value) {
      const indexed = await indexarAlvo(db, uf, ano, onProgress);

      if (Result.isError(indexed)) return indexed;

      total += indexed.value;
    }
  } finally {
    db.close();
  }

  return Result.ok({
    dominio: DOMINIO,
    registros: total,
    atualizadoEm: new Date().toISOString(),
    caminho: dbPath(),
    detalhes: {
      ufs: scope.ufs ?? [...UFS_COM_DADOS],
      // DEFAULT-2026: sem --anos, o escopo efetivo e o ano corrente (nao "todos").
      anos: anosEfetivos(scope),
      arquivos: alvos.value.length,
    },
  });
}

export const queridoDiarioIndexAdapter: IndexAdapter & {
  buildQueridoDiario: typeof buildQueridoDiario;
} = {
  key: DOMINIO,
  titulo,
  storage: "sqlite",
  requiresHeavyDownload: true,
  buildQueridoDiario,
  async build(opts?: BuildOptions): Promise<ResultType<BuildSummary, AdapterError>> {
    return buildQueridoDiario(opts);
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const existe = dbExistsOnDisk();
    const caminho = dbPath();
    let registros: number | null = null;
    let atualizadoEm: string | null = null;

    if (existe) {
      try {
        const db = openDb(DOMINIO, DB_FILE);

        try {
          registros = countRows(db, "diarios");
        } finally {
          db.close();
        }

        atualizadoEm = statSync(caminho).mtime.toISOString();
      } catch {
        registros = null;
      }
    }

    return Result.ok({
      key: DOMINIO,
      titulo,
      storage: "sqlite",
      requiresHeavyDownload: true,
      existe,
      atualizadoEm,
      registros,
      caminho,
    });
  },
};
