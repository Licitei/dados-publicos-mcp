/**
 * Indexer da fonte CAPAG.
 *
 * build(): descobre os resources mais recentes via CKAN package_show, baixa o
 * CSV de estados (historico multi-ano), o XLSX de municipios (posicao mais
 * recente) e o /entes do SICONFI (ponte cnpj<->cod_ibge), parseia e grava no
 * SQLite getDataDir()/capag/capag.db. RREO/RGF/DCA ficam ON-DEMAND (nao
 * espelhados aqui).
 *
 * storage='sqlite', requiresHeavyDownload=false (CAPAG e small-reference).
 */

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
import { fetchJson, fetchWithRetry } from "../../core/http/download";
import { parseCsv } from "../../core/parse/csv";
import { batchInsert, dbExists } from "../../core/store/sqlite-store";
import {
  DB_FILE,
  DOMINIO,
  MUNICIPIOS_XLSX,
  PACKAGE_SHOW,
  SICONFI_ENTES,
  TITULO,
} from "./catalog";
import { capagErrors } from "./errors";
import {
  extractPosicao,
  extractYear,
  mapEstadosRows,
  mapMunicipiosRows,
  readXlsxSheet,
} from "./parse";
import { countCapag, createSchema, openCapagDb } from "./service";

type CkanResource = {
  name: string;
  format: string;
  url: string;
  last_modified?: string;
  created?: string;
};

type CkanPackage = {
  success: boolean;
  result?: { resources: CkanResource[] };
};

type SiconfiEnte = {
  cod_ibge: number | string;
  ente: string;
  uf?: string;
  esfera?: string;
  regiao?: string;
  populacao?: number;
  cnpj?: string;
  exercicio?: number;
};

type SiconfiEntesResponse = {
  items?: SiconfiEnte[];
  hasMore?: boolean;
  offset?: number;
  limit?: number;
};

export const capagIndexAdapter: IndexAdapter = {
  key: "capag",
  titulo: TITULO,
  storage: "sqlite",
  requiresHeavyDownload: false,
  build,
  status,
};

async function build(
  opts?: BuildOptions,
): Promise<ResultType<BuildSummary, AdapterError>> {
  const progress = (msg: string) => opts?.onProgress?.(msg);
  const db = openCapagDb();

  progress("Descobrindo resources do CKAN (estados e municipios)...");

  const estadosResources = await discoverResources(PACKAGE_SHOW.estados, "CSV");

  if (Result.isError(estadosResources)) return estadosResources;

  const municipiosResources = await discoverResources(
    PACKAGE_SHOW.municipios,
    "XLSX",
  );

  if (Result.isError(municipiosResources)) return municipiosResources;

  // 1) Estados: baixa todos os anos para a serie historica (arquivos ~1KB).
  progress("Baixando CAPAG Estados (historico)...");
  const estadosResult = await indexEstados(
    db,
    estadosResources.value,
    progress,
  );

  if (Result.isError(estadosResult)) return estadosResult;

  // 2) Municipios: baixa apenas a posicao mais recente (XLSX ~22 MB).
  progress("Baixando CAPAG Municipios (posicao mais recente)...");
  const municipiosResult = await indexMunicipios(
    db,
    municipiosResources.value,
    progress,
  );

  if (Result.isError(municipiosResult)) return municipiosResult;

  // 3) SICONFI /entes: ponte cnpj<->cod_ibge.
  progress("Baixando SICONFI /entes (ponte cnpj<->cod_ibge)...");
  const entesResult = await indexEntes(db, progress);

  if (Result.isError(entesResult)) return entesResult;

  const counts = countCapag(db);
  const total = counts.estados + counts.municipios + counts.entes;

  return Result.ok({
    dominio: DOMINIO,
    registros: total,
    atualizadoEm: new Date().toISOString(),
    caminho: dominioPath(DOMINIO, DB_FILE),
    detalhes: {
      estados: counts.estados,
      municipios: counts.municipios,
      entes: counts.entes,
      anosEstados: counts.anosEstados,
      anosMunicipios: counts.anosMunicipios,
    },
  });
}

async function status(): Promise<ResultType<StatusInfo, AdapterError>> {
  const caminho = dominioPath(DOMINIO, DB_FILE);
  const existe = dbExists(DOMINIO, DB_FILE);

  if (!existe) {
    return Result.ok({
      key: "capag",
      titulo: TITULO,
      storage: "sqlite",
      requiresHeavyDownload: false,
      existe: false,
      atualizadoEm: null,
      registros: null,
      caminho,
    });
  }

  const db = openCapagDb();
  const counts = countCapag(db);

  return Result.ok({
    key: "capag",
    titulo: TITULO,
    storage: "sqlite",
    requiresHeavyDownload: false,
    existe: true,
    atualizadoEm: null,
    registros: counts.estados + counts.municipios + counts.entes,
    caminho,
  });
}

// ----------------------- descoberta CKAN -----------------------

function discoverResources(
  url: string,
  format: string,
): Promise<ResultType<CkanResource[], EvlogError>> {
  return Result.gen(async function* () {
    const json = yield* Result.await(fetchJson<CkanPackage>(url));
    const pkg = json;

    if (!pkg?.success || !pkg.result) {
      return yield* Result.err(capagErrors.CKAN_SEM_SUCESSO({ url }));
    }

    const resources = pkg.result.resources.filter(
      (r) => (r.format ?? "").toUpperCase() === format.toUpperCase(),
    );

    if (resources.length === 0) {
      return yield* Result.err(capagErrors.RESOURCE_AUSENTE({ format, url }));
    }

    return Result.ok(resources);
  });
}

// ----------------------- estados -----------------------

async function indexEstados(
  db: Database,
  resources: CkanResource[],
  progress: (msg: string) => void,
): Promise<ResultType<number, EvlogError>> {
  // Mantem o resource mais recente (por last_modified) de cada ano.
  const porAno = new Map<number, CkanResource>();

  for (const resource of resources) {
    const ano = extractYear(resource.name);

    if (ano === null) continue;

    const atual = porAno.get(ano);
    const newer = !atual || timeOf(resource) >= timeOf(atual);

    if (newer) porAno.set(ano, resource);
  }

  let inseridos = 0;

  for (const [ano, resource] of [...porAno.entries()].sort(
    (a, b) => a[0] - b[0],
  )) {
    progress(`Estados ${ano}...`);
    const bytes = await download(resource.url);

    if (Result.isError(bytes)) return bytes;

    const matrix = parseCsv(bytes.value, { delimiter: ";", encoding: "utf-8" });
    const dataRows = matrix.slice(1); // pula cabecalho
    const rows = mapEstadosRows(dataRows);

    db.query(`DELETE FROM capag_estados WHERE ano = ?`).run(ano);
    batchInsert(
      db,
      `INSERT OR REPLACE INTO capag_estados
        (uf, ano, indicador1, nota1, indicador2, nota2, indicador3, nota3, capag, qualidade_info, observacao)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      rows,
      (r) => [
        r.uf,
        ano,
        r.indicador1,
        r.nota1,
        r.indicador2,
        r.nota2,
        r.indicador3,
        r.nota3,
        r.capag,
        r.qualidadeInfo,
        r.observacao,
      ],
    );

    inseridos += rows.length;
  }

  return Result.ok(inseridos);
}

// ----------------------- municipios -----------------------

async function indexMunicipios(
  db: Database,
  resources: CkanResource[],
  progress: (msg: string) => void,
): Promise<ResultType<number, EvlogError>> {
  // Posicao mais recente: maior ano + data de posicao no nome / last_modified.
  const latest = [...resources].sort((a, b) => {
    const ya = extractYear(a.name) ?? 0;
    const yb = extractYear(b.name) ?? 0;

    if (ya !== yb) return yb - ya;

    const pa = extractPosicao(a.name) ?? "";
    const pb = extractPosicao(b.name) ?? "";

    if (pa !== pb) return pb.localeCompare(pa);

    return timeOf(b) - timeOf(a);
  })[0];

  if (!latest) {
    return Result.err(capagErrors.MUNICIPIOS_VAZIO());
  }

  const anoBase = inferAnoBaseMunicipios(latest.name);
  const posicao = extractPosicao(latest.name);

  progress(`Municipios ${anoBase} (${latest.name})...`);

  const bytes = await download(latest.url);

  if (Result.isError(bytes)) return bytes;

  const built = Result.try({
    try: () => {
      const rows = readXlsxSheet(bytes.value, (name) =>
        name.trim().startsWith(MUNICIPIOS_XLSX.sheetPrefix),
      );

      return mapMunicipiosRows(rows);
    },
    catch: (cause): EvlogError =>
      capagErrors.FONTE_PARSE({ internal: { cause: String(cause) } }),
  });

  if (Result.isError(built)) return built;

  const rows = built.value;

  db.query(`DELETE FROM capag_municipios WHERE ano_base = ?`).run(anoBase);
  db.exec(`DELETE FROM capag_municipios_fts`);

  batchInsert(
    db,
    `INSERT OR REPLACE INTO capag_municipios
      (cod_ibge, nome, uf, ano_base, posicao, indicador1, nota1, indicador2, nota2, indicador3, nota3, capag)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    rows,
    (r) => [
      r.codIbge,
      r.nome,
      r.uf,
      anoBase,
      posicao,
      r.indicador1,
      r.nota1,
      r.indicador2,
      r.nota2,
      r.indicador3,
      r.nota3,
      r.capag,
    ],
  );

  batchInsert(
    db,
    `INSERT INTO capag_municipios_fts (cod_ibge, nome, uf) VALUES (?,?,?)`,
    rows,
    (r) => [r.codIbge, r.nome, r.uf],
  );

  return Result.ok(rows.length);
}

function inferAnoBaseMunicipios(name: string): number {
  // O nome da aba e "CAPAG Ano Base AAAA" e tipicamente ano-1 da posicao.
  // Usamos o ano do nome do resource - 1 quando ele referir a posicao do ano
  // corrente; caso a aba traga o ano-base, mapMunicipios nao depende disso.
  const year = extractYear(name);

  if (year === null) return new Date().getFullYear() - 1;

  // A posicao de 2025 corresponde ao ano-base 2024 (declaracoes do exercicio
  // anterior). Mantemos o ano da posicao como rotulo do resource.
  return year;
}

// ----------------------- entes (SICONFI) -----------------------

function indexEntes(
  db: Database,
  progress: (msg: string) => void,
): Promise<ResultType<number, EvlogError>> {
  return Result.gen(async function* () {
    const all: SiconfiEnte[] = [];
    let offset = 0;
    const limit = 6000;

    while (true) {
      const url = `${SICONFI_ENTES}?limit=${limit}&offset=${offset}`;
      const json = yield* Result.await(fetchJson<SiconfiEntesResponse>(url));
      const items = json?.items ?? [];

      all.push(...items);

      if (!json?.hasMore || items.length === 0) break;

      offset += items.length;
      progress(`Entes: ${all.length}...`);
    }

    return Result.ok(dedupAndInsertEntes(db, all));
  });
}

function dedupAndInsertEntes(db: Database, all: SiconfiEnte[]): number {
  // Deduplica por cod_ibge mantendo o de maior exercicio.
  const byCod = new Map<string, SiconfiEnte>();

  for (const ente of all) {
    const cod = String(ente.cod_ibge).replace(/\D/g, "").padStart(7, "0");

    if (cod.length < 6) continue;

    const prev = byCod.get(cod);

    if (!prev || (ente.exercicio ?? 0) >= (prev.exercicio ?? 0)) {
      byCod.set(cod, ente);
    }
  }

  const rows = [...byCod.entries()];

  db.exec(`DELETE FROM siconfi_entes`);
  batchInsert(
    db,
    `INSERT OR REPLACE INTO siconfi_entes
      (cod_ibge, ente, uf, esfera, regiao, populacao, cnpj, exercicio)
     VALUES (?,?,?,?,?,?,?,?)`,
    rows,
    ([cod, e]) => [
      cod,
      e.ente,
      e.uf ?? null,
      e.esfera ?? null,
      e.regiao ?? null,
      e.populacao ?? null,
      e.cnpj ? String(e.cnpj).replace(/\D/g, "") : null,
      e.exercicio ?? null,
    ],
  );

  return rows.length;
}

// ----------------------- helpers -----------------------

async function download(
  url: string,
): Promise<ResultType<Uint8Array, EvlogError>> {
  const fetched = await fetchWithRetry(url);

  if (Result.isError(fetched)) {
    return Result.err(
      capagErrors.FONTE_DOWNLOAD({
        url,
        internal: { cause: fetched.error.message },
      }),
    );
  }

  const response = fetched.value;

  return Result.tryPromise({
    try: async () => new Uint8Array(await response.arrayBuffer()),
    catch: (cause): EvlogError =>
      capagErrors.FONTE_DOWNLOAD({ url, internal: { cause: String(cause) } }),
  });
}

function timeOf(resource: CkanResource): number {
  const value = resource.last_modified ?? resource.created;

  if (!value) return 0;

  const t = Date.parse(value);

  return Number.isFinite(t) ? t : 0;
}

// Garante schema acessivel para consumidores externos (e.g. testes ad-hoc).
export { createSchema };
