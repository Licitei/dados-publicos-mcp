/**
 * Indexer da fonte receita-cnpj.
 *
 * build() faz o DOWNLOAD PESADO de verdade (~7,5 GB/mes comprimido) quando
 * rodado pelo usuario: descobre a pasta mensal mais recente via PROPFIND no
 * WebDAV, baixa os ZIPs (Range/206, resumivel), descompacta, decodifica
 * Latin-1, faz o parse com as funcoes PURAS de mappers.ts e grava no SQLite.
 *
 * O parsing/mapeamento esta TODO em mappers.ts (puro, testavel com fixtures);
 * este arquivo cuida de I/O (rede + disco) e orquestracao.
 */

import { existsSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
import { dominioDir, dominioPath } from "../../core/dataDir";
import { unzipFirst } from "../../core/parse/zip";
import { openDb, countRows } from "../../core/store/sqlite-store";
import {
  DOMINIO_FILES,
  RECEITA_CNPJ_KEY,
  RECEITA_CNPJ_TITULO,
  RFB_WEBDAV,
  SIMPLES_FILE,
  partFiles,
  rfbAuthHeader,
  webdavFileUrl,
  type DominioTabela,
} from "./catalog";
import {
  createSchema,
  insertDominio,
  insertEmpresas,
  insertEstabelecimentos,
  insertSimples,
  insertSocios,
} from "./db";
import { receitaCnpjErrors } from "./errors";
import {
  parseDominio,
  parseEmpresas,
  parseEstabelecimentos,
  parseSimples,
  parseSocios,
} from "./mappers";
import { DB_FILE, dbPath } from "./service";

/** Canal de erro recuperavel do indexer (catalogo evlog). */
export type ReceitaCnpjIndexError = EvlogError;

type Scope = {
  /** Pasta mensal YYYY-MM. Default: a mais recente descoberta via PROPFIND. */
  mes?: string;
  /** Restringe os ZIPs particionados (Empresas/Estab/Socios) a estas partes (0..9). */
  partes?: number[];
  /** Restringe UFs (filtra estabelecimentos na ingestao). */
  ufs?: string[];
  /** Pula as tabelas pesadas (socios) quando false. */
  incluirSocios?: boolean;
  /** Pula Simples quando false. */
  incluirSimples?: boolean;
};

/**
 * Descobre as pastas mensais YYYY-MM via PROPFIND (Depth:1) no root do
 * WebDAV. Retorna ordenado desc (mais recente primeiro).
 */
export async function listarPastasMensais(): Promise<
  ResultType<string[], EvlogError>
> {
  return Result.tryPromise({
    try: async () => {
      const response = await fetchWithRetry(RFB_WEBDAV, {
        method: "PROPFIND",
        headers: {
          authorization: rfbAuthHeader(),
          depth: "1",
          "content-type": "application/xml",
        },
      });
      const xml = await response.text();
      return extrairPastasMensais(xml);
    },
    catch: (cause): EvlogError =>
      receitaCnpjErrors.FETCH({
        url: RFB_WEBDAV,
        internal: { cause: String(cause) },
      }),
  });
}

/**
 * Extrai e ordena (desc) as pastas YYYY-MM de uma resposta XML do PROPFIND.
 * Funcao PURA (testavel com fixture de XML).
 */
export function extrairPastasMensais(xml: string): string[] {
  const meses = new Set<string>();
  const re = /(\d{4}-\d{2})\/?<\/(?:d:href|href)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) {
    meses.add(m[1]);
  }
  // Fallback: qualquer YYYY-MM no texto.
  if (meses.size === 0) {
    const re2 = /\b(20\d{2}-(?:0[1-9]|1[0-2]))\b/g;
    while ((m = re2.exec(xml)) !== null) meses.add(m[1]);
  }
  return Array.from(meses).sort((a, b) => b.localeCompare(a));
}

const userAgent =
  "dados-publicos-mcp/0.1.0 (+https://github.com/Licitei/dados-publicos-mcp)";

/** Baixa um arquivo (resumivel) para o diretorio temporario do dominio. */
async function baixarArquivo(
  mes: string,
  file: string,
  onProgress?: (msg: string) => void
): Promise<ResultType<string, EvlogError>> {
  const url = webdavFileUrl(mes, file);
  const dest = dominioPath(RECEITA_CNPJ_KEY, `download/${mes}/${file}`);
  onProgress?.(`baixando ${file}...`);
  return downloadToFileAuth(url, dest);
}

/** Tamanho atual de um arquivo (0 se ainda nao existir) — sem lancar. */
function tamanhoAtual(dest: string): number {
  return existsSync(dest) ? statSync(dest).size : 0;
}

/**
 * downloadToFile do core nao expoe headers; o share exige Basic auth.
 * Implementamos download por streaming com o Authorization header e suporte
 * a Range/206 (resumivel): se ja existe um arquivo parcial, pede o restante.
 */
async function downloadToFileAuth(
  url: string,
  dest: string
): Promise<ResultType<string, EvlogError>> {
  return Result.tryPromise({
    try: async () => {
      const { mkdir, open } = await import("node:fs/promises");
      const { dirname } = await import("node:path");
      await mkdir(dirname(dest), { recursive: true });

      const existing = tamanhoAtual(dest);

      const headers: Record<string, string> = {
        authorization: rfbAuthHeader(),
        "user-agent": userAgent,
      };
      if (existing > 0) headers.range = `bytes=${existing}-`;

      const response = await fetchWithRetry(url, { headers });
      const append = response.status === 206 && existing > 0;
      const handle = await open(dest, append ? "a" : "w");
      try {
        const body = response.body;
        if (!body) {
          await handle.write(new Uint8Array(await response.arrayBuffer()));
        } else {
          const reader = body.getReader();
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) await handle.write(value);
          }
        }
      } finally {
        await handle.close();
      }
      return dest;
    },
    catch: (cause): EvlogError =>
      receitaCnpjErrors.FETCH({ url, internal: { cause: String(cause) } }),
  });
}

/**
 * Le um ZIP do disco, extrai o unico CSV e devolve seus bytes num Result.
 * Falhas de IO/descompactacao viram PARSE (zip corrompido panica no core).
 */
function lerCsv(zipPath: string): Promise<ResultType<Uint8Array, EvlogError>> {
  return Result.tryPromise({
    try: async () => {
      const zipBytes = await readFile(zipPath);
      return unzipFirst(zipBytes);
    },
    catch: (cause): EvlogError =>
      receitaCnpjErrors.PARSE({ file: zipPath, internal: { cause: String(cause) } }),
  });
}

/**
 * Resolve a pasta mensal alvo.
 *
 * - Se o escopo informar `mes` (flag --mes), usa-o (sobrepoe o default).
 * - DEFAULT-2026: sem flags de escopo, indexa SOMENTE o ano corrente. O escopo
 *   padrao desta fonte e o mes mais recente do ANO CORRENTE descoberto via
 *   PROPFIND. O ano e dinamico (new Date().getFullYear()) — runtime, permitido.
 * - Se nao houver nenhuma pasta do ano corrente, cai para a mais recente
 *   disponivel no share (comportamento anterior preservado).
 */
async function resolverMes(
  mesEscopo: string | undefined
): Promise<ResultType<string, EvlogError>> {
  return Result.gen(async function* () {
    if (mesEscopo) return Result.ok(mesEscopo);

    const pastas = yield* Result.await(listarPastasMensais());

    const anoCorrente = String(new Date().getFullYear());
    const doAnoCorrente = pastas.filter((m) => m.startsWith(`${anoCorrente}-`));
    // pastas ja vem ordenado desc -> [0] e o mes mais recente.
    const mes = doAnoCorrente[0] ?? pastas[0];

    if (!mes) {
      return yield* Result.err(receitaCnpjErrors.FETCH({ url: RFB_WEBDAV }));
    }

    return Result.ok(mes);
  });
}

const titulo = RECEITA_CNPJ_TITULO;

export const receitaCnpjIndexAdapter: IndexAdapter = {
  key: RECEITA_CNPJ_KEY,
  titulo,
  storage: "sqlite",
  requiresHeavyDownload: true,

  async build(opts?: BuildOptions): Promise<ResultType<BuildSummary, AdapterError>> {
    const scope = (opts?.scope ?? {}) as Scope;
    const onProgress = opts?.onProgress;

    // 1. Resolver a pasta mensal alvo (escopo / DEFAULT-2026 / mais recente).
    const mesResult = await resolverMes(scope.mes);
    if (Result.isError(mesResult)) return mesResult;
    const mes = mesResult.value;
    onProgress?.(`pasta mensal: ${mes}`);

    const partes = scope.partes ?? Array.from({ length: 10 }, (_, i) => i);
    const ufsFiltro = scope.ufs?.map((u) => u.toUpperCase());
    const incluirSocios = scope.incluirSocios ?? true;
    const incluirSimples = scope.incluirSimples ?? true;

    const db = openDb(RECEITA_CNPJ_KEY, DB_FILE);

    // Toda operacao SINCRONA no SQLite (schema/insert/count) pode lancar; cada
    // passo e embrulhado num Result.try -> PARSE, e o download em Result.await.
    const indexado = await Result.gen(async function* () {
      yield* Result.try({
        try: () => createSchema(db),
        catch: (cause): EvlogError =>
          receitaCnpjErrors.PARSE({ file: DB_FILE, internal: { cause: String(cause) } }),
      });

      // 2. Tabelas de dominio (pequenas) primeiro.
      for (const { tabela, file } of DOMINIO_FILES) {
        const dest = yield* Result.await(baixarArquivo(mes, file, onProgress));
        const csv = yield* Result.await(lerCsv(dest));
        yield* Result.try({
          try: () => insertDominio(db, tabela as DominioTabela, parseDominio(csv)),
          catch: (cause): EvlogError =>
            receitaCnpjErrors.PARSE({ file, internal: { cause: String(cause) } }),
        });
      }

      // 3. Empresas (0..9).
      for (const file of selecionarPartes(partFiles("Empresas"), partes)) {
        const dest = yield* Result.await(baixarArquivo(mes, file, onProgress));
        const csv = yield* Result.await(lerCsv(dest));
        yield* Result.try({
          try: () => insertEmpresas(db, parseEmpresas(csv)),
          catch: (cause): EvlogError =>
            receitaCnpjErrors.PARSE({ file, internal: { cause: String(cause) } }),
        });
      }

      // 4. Estabelecimentos (0..9) com filtro opcional de UF.
      for (const file of selecionarPartes(partFiles("Estabelecimentos"), partes)) {
        const dest = yield* Result.await(baixarArquivo(mes, file, onProgress));
        const csv = yield* Result.await(lerCsv(dest));
        yield* Result.try({
          try: () => {
            let estabs = parseEstabelecimentos(csv);
            if (ufsFiltro) estabs = estabs.filter((e) => ufsFiltro.includes(e.uf));
            insertEstabelecimentos(db, estabs);
          },
          catch: (cause): EvlogError =>
            receitaCnpjErrors.PARSE({ file, internal: { cause: String(cause) } }),
        });
      }

      // 5. Socios (0..9).
      if (incluirSocios) {
        for (const file of selecionarPartes(partFiles("Socios"), partes)) {
          const dest = yield* Result.await(baixarArquivo(mes, file, onProgress));
          const csv = yield* Result.await(lerCsv(dest));
          yield* Result.try({
            try: () => insertSocios(db, parseSocios(csv)),
            catch: (cause): EvlogError =>
              receitaCnpjErrors.PARSE({ file, internal: { cause: String(cause) } }),
          });
        }
      }

      // 6. Simples Nacional / MEI (arquivo unico).
      if (incluirSimples) {
        const dest = yield* Result.await(baixarArquivo(mes, SIMPLES_FILE, onProgress));
        const csv = yield* Result.await(lerCsv(dest));
        yield* Result.try({
          try: () => insertSimples(db, parseSimples(csv)),
          catch: (cause): EvlogError =>
            receitaCnpjErrors.PARSE({ file: SIMPLES_FILE, internal: { cause: String(cause) } }),
        });
      }

      const summary = yield* Result.try({
        try: (): BuildSummary => {
          const registros = countRows(db, "estabelecimentos");
          return {
            dominio: RECEITA_CNPJ_KEY,
            registros,
            atualizadoEm: new Date().toISOString(),
            caminho: dbPath(),
            detalhes: {
              mes,
              empresas: countRows(db, "empresas"),
              estabelecimentos: registros,
              socios: countRows(db, "socios"),
              simples: countRows(db, "simples"),
            },
          };
        },
        catch: (cause): EvlogError =>
          receitaCnpjErrors.PARSE({ file: DB_FILE, internal: { cause: String(cause) } }),
      });

      return Result.ok(summary);
    });

    db.close();

    return indexado;
  },

  async status(): Promise<ResultType<StatusInfo, AdapterError>> {
    const caminho = dbPath();
    const existe = existsSync(caminho);
    let registros: number | null = null;
    let atualizadoEm: string | null = null;

    if (existe) {
      const db = openDb(RECEITA_CNPJ_KEY, DB_FILE);
      const contados = Result.try({
        try: () => countRows(db, "estabelecimentos"),
        catch: (cause): EvlogError =>
          receitaCnpjErrors.PARSE({ file: DB_FILE, internal: { cause: String(cause) } }),
      });
      db.close();
      registros = Result.isOk(contados) ? contados.value : null;

      const mtime = Result.try({
        try: () => statSync(caminho).mtime.toISOString(),
        catch: (cause): EvlogError =>
          receitaCnpjErrors.PARSE({ file: caminho, internal: { cause: String(cause) } }),
      });
      atualizadoEm = Result.isOk(mtime) ? mtime.value : null;
    }

    return Result.ok({
      key: RECEITA_CNPJ_KEY,
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

function selecionarPartes(files: string[], partes: number[]): string[] {
  const set = new Set(partes);
  return files.filter((_, i) => set.has(i));
}

// dominioDir e referenciado para manter clareza do layout em disco.
export function downloadDir(): string {
  return dominioDir(RECEITA_CNPJ_KEY);
}
