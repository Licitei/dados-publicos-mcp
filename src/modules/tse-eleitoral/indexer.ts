import type { Database } from "bun:sqlite";
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
import { downloadToFile } from "../../core/http/download";
import { parseCsvObjects } from "../../core/parse/csv";
import { unzipEntries } from "../../core/parse/zip";
import { batchInsert, countRows, openDb } from "../../core/store/sqlite-store";
import {
  classifyPrestacao,
  CSV_DELIMITER,
  CSV_ENCODING,
  isBrasilCsv,
  KEY,
  TITULO,
  zipUrl,
  type DatasetTipo,
} from "./catalog";
import { tseEleitoralErrors } from "./errors";
import {
  applySchema,
  bindBem,
  bindCandidato,
  bindDespesa,
  bindReceita,
  bindReceitaOrig,
  DB_FILE,
  INSERT_BEM,
  INSERT_CANDIDATO,
  INSERT_DESPESA,
  INSERT_RECEITA,
  INSERT_RECEITA_ORIG,
  mapBem,
  mapCandidato,
  mapDespesaContratada,
  mapReceita,
  mapReceitaOriginario,
  rebuildFts,
} from "./store";

const CSV_OPTS = { delimiter: CSV_DELIMITER, encoding: CSV_ENCODING };

/** Le os bytes de um CSV e o transforma em objetos linha->valor. */
export function parseTseCsv(bytes: Uint8Array): Record<string, string>[] {
  return parseCsvObjects(bytes, undefined, CSV_OPTS);
}

// ---------------------------------------------------------------------------
// Carregamento PURO em um Database (qualquer DB, incluindo :memory:).
// Recebe os BYTES ja descompactados de cada zip - sem rede.
// ---------------------------------------------------------------------------

export type ZipBytes = {
  /** entradas do zip: nome -> bytes do arquivo */
  entries: { name: string; bytes: () => Uint8Array }[];
};

/** Carrega candidatos (consulta_cand) de um zip ja descompactado. */
export function loadCandidatos(db: Database, zip: ZipBytes): number {
  let total = 0;

  for (const entry of zip.entries) {
    if (!isBrasilCsv(entry.name) || !/consulta_cand/i.test(entry.name)) {
      continue;
    }

    const rows = parseTseCsv(entry.bytes()).map(mapCandidato);

    batchInsert(db, INSERT_CANDIDATO, rows, bindCandidato);
    total += rows.length;
  }

  return total;
}

/** Carrega bens de candidatos (bem_candidato) de um zip ja descompactado. */
export function loadBens(db: Database, zip: ZipBytes): number {
  let total = 0;

  for (const entry of zip.entries) {
    if (!isBrasilCsv(entry.name) || !/bem_candidato/i.test(entry.name)) {
      continue;
    }

    const rows = parseTseCsv(entry.bytes()).map(mapBem);

    batchInsert(db, INSERT_BEM, rows, bindBem);
    total += rows.length;
  }

  return total;
}

/**
 * Carrega as 3 tabelas de prestacao de contas (receitas,
 * receitas_doador_originario, despesas_contratadas) de um zip ja
 * descompactado, indexando somente os arquivos *_BRASIL.csv.
 */
export function loadPrestacaoContas(db: Database, zip: ZipBytes): number {
  let total = 0;

  for (const entry of zip.entries) {
    const tabela = classifyPrestacao(entry.name);

    if (!tabela) continue;

    const rows = parseTseCsv(entry.bytes());

    if (tabela === "receitas") {
      const mapped = rows.map(mapReceita);

      batchInsert(db, INSERT_RECEITA, mapped, bindReceita);
      total += mapped.length;
    } else if (tabela === "receitas_doador_originario") {
      const mapped = rows.map(mapReceitaOriginario);

      batchInsert(db, INSERT_RECEITA_ORIG, mapped, bindReceitaOrig);
      total += mapped.length;
    } else {
      const mapped = rows.map(mapDespesaContratada);

      batchInsert(db, INSERT_DESPESA, mapped, bindDespesa);
      total += mapped.length;
    }
  }

  return total;
}

// ---------------------------------------------------------------------------
// Escopo do build
// ---------------------------------------------------------------------------

type Escopo = {
  anos: number[];
  tipos: DatasetTipo[];
};

const TODOS_TIPOS: DatasetTipo[] = [
  "consulta_cand",
  "bem_candidato",
  "prestacao_contas",
];

/**
 * Escopo padrao desta fonte (DEFAULT-2026): sem flags de escopo
 * (BuildOptions.scope vazio), o build indexa SOMENTE o ano corrente.
 * Resolvido dinamicamente em runtime (permitido) via new Date().getFullYear(),
 * para nao precisar editar o codigo a cada ciclo eleitoral. As flags
 * --anos/--mes/--ufs (scope.anos/scope.tipos) continuam SOBREPONDO este default.
 */
function defaultAnos(): number[] {
  return [new Date().getFullYear()];
}

/**
 * Resolve o escopo do build a partir de BuildOptions.scope.
 * scope.anos: number[] | number; scope.tipos: DatasetTipo[].
 */
export function resolveEscopo(scope?: Record<string, unknown>): Escopo {
  const anosRaw = scope?.anos;

  const anosResolvidos = Array.isArray(anosRaw)
    ? anosRaw.map(Number).filter((n) => Number.isFinite(n))
    : typeof anosRaw === "number"
      ? [anosRaw]
      : typeof anosRaw === "string" && anosRaw.trim()
        ? anosRaw
            .split(/[,\s]+/)
            .map(Number)
            .filter((n) => Number.isFinite(n))
        : // DEFAULT-2026: sem scope.anos -> apenas o ano corrente.
          defaultAnos();

  // DEFAULT-2026: se sobrou vazio apos o filtro, cai no ano corrente.
  const anos = anosResolvidos.length === 0 ? defaultAnos() : anosResolvidos;

  const tiposRaw = scope?.tipos;

  const tiposResolvidos =
    Array.isArray(tiposRaw) && tiposRaw.length > 0
      ? tiposRaw.filter((t): t is DatasetTipo =>
          (TODOS_TIPOS as string[]).includes(String(t))
        )
      : [...TODOS_TIPOS];

  const tipos =
    tiposResolvidos.length === 0 ? [...TODOS_TIPOS] : tiposResolvidos;

  return { anos, tipos };
}

// ---------------------------------------------------------------------------
// Adapter (build pesado de verdade + status)
// ---------------------------------------------------------------------------

function dbPath(): string {
  return dominioPath(KEY, DB_FILE);
}

export const tseEleitoralIndexAdapter: IndexAdapter = {
  key: KEY,
  titulo: TITULO,
  storage: "sqlite",
  requiresHeavyDownload: true,

  async build(
    opts?: BuildOptions
  ): Promise<ResultType<BuildSummary, AdapterError>> {
    const escopo = resolveEscopo(opts?.scope);
    const onProgress = opts?.onProgress ?? (() => {});
    const db = openDb(KEY, DB_FILE);

    applySchema(db);

    let registros = 0;
    const detalhes: Record<string, number> = {};

    for (const ano of escopo.anos) {
      for (const tipo of escopo.tipos) {
        const url = zipUrl(tipo, ano);
        const tmp = dominioPath(KEY, `tmp_${tipo}_${ano}.zip`);

        onProgress(`Baixando ${tipo} ${ano}...`);

        const downloaded = await downloadToFile(url, tmp);

        if (Result.isError(downloaded)) {
          return Result.err(
            tseEleitoralErrors.DOWNLOAD({
              url,
              internal: { cause: downloaded.error.message },
            })
          );
        }

        onProgress(`Descompactando e indexando ${tipo} ${ano}...`);

        const loaded = await Result.tryPromise({
          try: async () => {
            const bytes = await Bun.file(tmp).bytes();
            const zip: ZipBytes = { entries: unzipEntries(bytes) };

            if (tipo === "consulta_cand") return loadCandidatos(db, zip);
            if (tipo === "bem_candidato") return loadBens(db, zip);

            return loadPrestacaoContas(db, zip);
          },
          catch: (cause): EvlogError =>
            tseEleitoralErrors.PROCESSAMENTO({
              tipo,
              ano,
              internal: { arquivo: tmp, cause: String(cause) },
            }),
        });

        if (Result.isError(loaded)) {
          return Result.err(loaded.error);
        }

        const count = loaded.value;

        detalhes[`${tipo}_${ano}`] = count;
        registros += count;

        // Limpeza best-effort do zip temporario (ignora falha de remocao).
        await Result.tryPromise({
          try: () => Bun.file(tmp).delete(),
          catch: (cause): EvlogError =>
            tseEleitoralErrors.PROCESSAMENTO({
              tipo,
              ano,
              internal: { arquivo: tmp, cause: String(cause) },
            }),
        });
      }
    }

    onProgress("Construindo indices FTS...");
    rebuildFts(db);

    const atualizadoEm = new Date().toISOString();

    db.exec(
      `CREATE TABLE IF NOT EXISTS meta (chave TEXT PRIMARY KEY, valor TEXT)`
    );
    db.query(
      `INSERT INTO meta(chave,valor) VALUES('atualizadoEm',?)
       ON CONFLICT(chave) DO UPDATE SET valor=excluded.valor`
    ).run(atualizadoEm);

    return Result.ok({
      dominio: KEY,
      registros,
      atualizadoEm,
      caminho: dbPath(),
      detalhes: { ...detalhes, anos: escopo.anos.join(","), licenca: "CC-BY (TSE)" },
    });
  },

  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const caminho = dbPath();
    const existe = Bun.file(caminho).size > 0;

    if (!existe) {
      return Result.ok({
        key: KEY,
        titulo: TITULO,
        storage: "sqlite",
        requiresHeavyDownload: true,
        existe: false,
        atualizadoEm: null,
        registros: null,
        caminho,
      });
    }

    const db = openDb(KEY, DB_FILE);

    // Leitura best-effort: schema ausente/parcial -> mantem nulos (sem lancar).
    const lido = Result.try({
      try: () => {
        const registros =
          countRows(db, "receitas") +
          countRows(db, "despesas_contratadas") +
          countRows(db, "candidatos") +
          countRows(db, "bens") +
          countRows(db, "receitas_doador_originario");

        const row = db
          .query(`SELECT valor FROM meta WHERE chave='atualizadoEm'`)
          .get() as { valor: string } | null;

        return { registros, atualizadoEm: row?.valor ?? null };
      },
      catch: (cause): EvlogError =>
        tseEleitoralErrors.PROCESSAMENTO({
          tipo: "status",
          ano: 0,
          internal: { arquivo: caminho, cause: String(cause) },
        }),
    });

    const dados = Result.isOk(lido)
      ? lido.value
      : { registros: null as number | null, atualizadoEm: null as string | null };

    return Result.ok({
      key: KEY,
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: true,
      existe: true,
      atualizadoEm: dados.atualizadoEm,
      registros: dados.registros,
      caminho,
    });
  },
};
