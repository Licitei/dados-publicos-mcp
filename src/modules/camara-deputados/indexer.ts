/**
 * Indexador HEAVY da Camara dos Deputados.
 *
 * O build() faz os downloads grandes de verdade quando rodado pelo usuario
 * (deputados.csv + CEAP por ano + opcionalmente proposicoes/autores), parseia
 * com as funcoes PURAS de mapping.ts e grava no SQLite via store.ts.
 *
 * Escopo via BuildOptions.scope:
 *   - anos: number[]            anos especificos a indexar (CEAP/proposicoes)
 *   - anoInicial / anoFinal     intervalo de anos (inclusivo)
 *   - incluirProposicoes: bool  baixar tambem proposicoes + autores
 *   - pularDeputados: bool      nao rebaixar deputados.csv
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
import { fetchWithRetry } from "../../core/http/download";
import { unzipFirst } from "../../core/parse/zip";
import { openDb } from "../../core/store/sqlite-store";
import { existsSync } from "node:fs";
import {
  anosNoIntervalo,
  ceapUrl,
  CEAP_ANO_MAX,
  CEAP_ANO_MIN,
  DB_FILE,
  defaultAnos,
  DEPUTADOS_URL,
  DOMINIO,
  proposicoesAutoresUrl,
  proposicoesUrl,
  TITULO,
} from "./catalog";
import { camaraErrors } from "./errors";
import {
  parseDeputados,
  parseDespesas,
  parseProposicoes,
  parseProposicoesAutores,
} from "./mapping";
import { dbPath } from "./service";
import {
  initDb,
  inserirDeputados,
  inserirDespesas,
  inserirProposicoes,
  inserirProposicoesAutores,
  setMeta,
} from "./store";

export type CamaraIndexError = EvlogError;

type Escopo = {
  anos: number[];
  incluirProposicoes: boolean;
  pularDeputados: boolean;
};

/** Resolve o escopo (anos/flags) a partir de BuildOptions.scope. */
export function resolverEscopo(scope?: Record<string, unknown>): Escopo {
  const raw = scope ?? {};
  let anos: number[] = [];

  if (Array.isArray(raw.anos)) {
    anos = raw.anos
      .map((a) => Number(a))
      .filter((a) => Number.isInteger(a) && a >= CEAP_ANO_MIN && a <= CEAP_ANO_MAX);
  } else if (raw.anoInicial !== undefined || raw.anoFinal !== undefined) {
    const ini = Number(raw.anoInicial ?? raw.anoFinal);
    const fim = Number(raw.anoFinal ?? raw.anoInicial);

    if (Number.isInteger(ini) && Number.isInteger(fim)) {
      anos = anosNoIntervalo(ini, fim);
    }
  }

  if (anos.length === 0) anos = defaultAnos();

  return {
    anos: [...new Set(anos)].sort((a, b) => a - b),
    incluirProposicoes: raw.incluirProposicoes === true,
    pularDeputados: raw.pularDeputados === true,
  };
}

async function baixarBytes(
  url: string
): Promise<ResultType<Uint8Array, EvlogError>> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetchWithRetry(url, undefined, {
        timeoutMs: 600_000,
      });
      const buffer = await response.arrayBuffer();

      return new Uint8Array(buffer);
    },
    catch: (cause): EvlogError =>
      camaraErrors.DOWNLOAD({ url, internal: { cause: String(cause) } }),
  });
}

async function buildCamaraIndex(
  opts?: BuildOptions
): Promise<ResultType<BuildSummary, CamaraIndexError>> {
  const escopo = resolverEscopo(opts?.scope);
  const log = (msg: string) => opts?.onProgress?.(msg);
  const db = openDb(DOMINIO, DB_FILE);

  initDb(db);

  let totalDeputados = 0;
  let totalDespesas = 0;
  let totalProposicoes = 0;
  let totalAutores = 0;

  try {
    if (!escopo.pularDeputados) {
      log("Baixando deputados.csv...");
      const bytes = await baixarBytes(DEPUTADOS_URL);

      if (Result.isError(bytes)) return bytes;

      const rows = parseDeputados(bytes.value);

      inserirDeputados(db, rows);
      totalDeputados = rows.length;
      log(`Deputados indexados: ${totalDeputados}`);
    }

    for (const ano of escopo.anos) {
      log(`Baixando CEAP ${ano}...`);
      const zipBytes = await baixarBytes(ceapUrl(ano));

      if (Result.isError(zipBytes)) return zipBytes;

      const csvBytes = unzipFirst(zipBytes.value);
      const rows = parseDespesas(csvBytes);

      inserirDespesas(db, rows);
      totalDespesas += rows.length;
      log(`CEAP ${ano} indexado: ${rows.length} despesas`);

      if (escopo.incluirProposicoes) {
        log(`Baixando proposicoes ${ano}...`);
        const propBytes = await baixarBytes(proposicoesUrl(ano));

        if (Result.isError(propBytes)) return propBytes;

        const props = parseProposicoes(propBytes.value);

        inserirProposicoes(db, props);
        totalProposicoes += props.length;

        log(`Baixando autores de proposicoes ${ano}...`);
        const autBytes = await baixarBytes(proposicoesAutoresUrl(ano));

        if (Result.isError(autBytes)) return autBytes;

        const autores = parseProposicoesAutores(autBytes.value);

        inserirProposicoesAutores(db, autores);
        totalAutores += autores.length;
        log(`Proposicoes ${ano} indexadas: ${props.length} (autores: ${autores.length})`);
      }
    }

    const atualizadoEm = new Date().toISOString();

    setMeta(db, "atualizadoEm", atualizadoEm);
    setMeta(db, "anos", escopo.anos.join(","));

    const registros =
      totalDeputados + totalDespesas + totalProposicoes + totalAutores;

    return Result.ok({
      dominio: DOMINIO,
      registros,
      atualizadoEm,
      caminho: dbPath(),
      detalhes: {
        anos: escopo.anos,
        deputados: totalDeputados,
        despesas: totalDespesas,
        proposicoes: totalProposicoes,
        proposicoesAutores: totalAutores,
        incluiuProposicoes: escopo.incluirProposicoes,
      },
    });
  } finally {
    db.close();
  }
}

export const camaraDeputadosIndexAdapter: IndexAdapter = {
  key: DOMINIO,
  titulo: TITULO,
  storage: "sqlite",
  requiresHeavyDownload: true,
  async build(
    options?: BuildOptions
  ): Promise<ResultType<BuildSummary, AdapterError>> {
    return buildCamaraIndex(options);
  },
  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const caminho = dbPath();
    const existe = existsSync(caminho);

    let atualizadoEm: string | null = null;
    let registros: number | null = null;

    if (existe) {
      const db = openDb(DOMINIO, DB_FILE);

      initDb(db);

      try {
        const meta = db
          .query("SELECT valor FROM meta WHERE chave = 'atualizadoEm'")
          .get() as { valor: string } | null;

        atualizadoEm = meta?.valor ?? null;

        const conta = (t: string) =>
          (db.query(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n;

        registros =
          conta("deputados") +
          conta("despesas") +
          conta("proposicoes") +
          conta("proposicoes_autores");
      } finally {
        db.close();
      }
    }

    return Result.ok({
      key: DOMINIO,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: true,
      existe,
      atualizadoEm,
      registros,
      caminho,
    });
  },
};
