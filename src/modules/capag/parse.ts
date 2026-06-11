/**
 * Parsing puro (sem rede, sem disco) para CAPAG:
 * - normalizacao de indicadores percentuais (estados em '92,29%' e municipios
 *   em fracao decimal 0.8016) para um unico formato: fracao (0..1, podendo ser
 *   negativa). Ex.: '92,29%' -> 0.9229 ; 0.8016 -> 0.8016.
 * - extracao de ano a partir de nomes de resource do CKAN.
 * - leitor minimo de XLSX (ZIP + XML) reaproveitando unzipEntries do core.
 */

import { panic } from "better-result";
import { unzipEntries } from "../../core/parse/zip";
import { MUNICIPIOS_XLSX, type NotaCapag } from "./catalog";

/**
 * Normaliza um indicador para fracao numerica.
 * Aceita '92,29%', '92.29%', '92,29', '0,8016' (estados / texto BR) e
 * 0.8016 / '0.8016' (XLSX de municipios, ja em fracao). Retorna null se vazio
 * ou nao numerico (ex.: 'n.d.').
 */
export function parseIndicador(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === "number") {
    return Number.isFinite(raw) ? raw : null;
  }

  const trimmed = raw.trim();

  if (!trimmed || /^n\.?[de]\.?$/i.test(trimmed)) return null;

  const hasPercent = trimmed.includes("%");
  const cleaned = trimmed.replace(/%/g, "").replace(/\s/g, "").replace(/,/g, ".");
  const value = Number(cleaned);

  if (!Number.isFinite(value)) return null;

  // '92,29%' -> 0.9229 ; '0,8016' (sem %) ja e fracao.
  return hasPercent ? value / 100 : value;
}

const notasValidas = new Set<string>(["A+", "A", "B+", "B", "C", "D", "n.d.", "n.e."]);

/** Normaliza uma nota CAPAG bruta; retorna null se vazia/desconhecida. */
export function parseNota(raw: string | null | undefined): NotaCapag | null {
  if (!raw) return null;

  const trimmed = raw.trim();

  if (notasValidas.has(trimmed)) return trimmed as NotaCapag;

  const lower = trimmed.toLowerCase();

  if (lower === "n.d." || lower === "nd") return "n.d.";
  if (lower === "n.e." || lower === "ne") return "n.e.";

  return null;
}

/**
 * Extrai o ano (AAAA, 2000..2099) de um nome de resource/aba do CKAN.
 * Ex.: 'Capag Estados 2025' -> 2025 ; 'CAPAG Ano Base 2024' -> 2024.
 * Retorna null se nao houver ano.
 */
export function extractYear(name: string): number | null {
  const match = name.match(/\b(20\d{2})\b/);

  return match ? Number(match[1]) : null;
}

/**
 * Extrai uma data de posicao (DD/MM/AAAA ou AAAA-MM-DD) do nome do resource,
 * devolvida em ISO (AAAA-MM-DD). Retorna null se nao encontrar.
 * Ex.: 'Capag Municipios 2025 - 09/11/2025' -> '2025-11-09'.
 */
export function extractPosicao(name: string): string | null {
  const br = name.match(/\b(\d{2})\/(\d{2})\/(\d{4})\b/);

  if (br) return `${br[3]}-${br[2]}-${br[1]}`;

  const iso = name.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);

  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

/** Converte letra(s) de coluna Excel ('A','AI','BR') em indice 0-based. */
export function colLetterToIndex(letters: string): number {
  let n = 0;

  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }

  return n - 1;
}

/** Cod IBGE para texto de 7 digitos (zero-padded). Retorna null se invalido. */
export function normalizeCodIbge(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  const digits = String(raw).trim().replace(/\D/g, "");

  if (digits.length < 6 || digits.length > 7) return null;

  return digits.padStart(7, "0");
}

// ----------------------- Leitor minimo de XLSX -----------------------

type SheetRef = { name: string; rid: string };

/** Linha de uma planilha como matriz de celulas (string) indexada por coluna. */
export type SheetRow = string[];

/**
 * Le uma aba especifica de um XLSX (bytes do arquivo) e devolve as linhas como
 * matriz de strings, resolvendo sharedStrings e valores cacheados de formula.
 * `matchSheet` escolhe a aba pelo nome (ex.: comeca com "CAPAG Ano Base").
 */
export function readXlsxSheet(
  xlsx: Uint8Array | ArrayBuffer,
  matchSheet: (name: string) => boolean
): SheetRow[] {
  const entries = unzipEntries(xlsx);
  const byName = new Map<string, Uint8Array>();

  for (const entry of entries) {
    byName.set(normalizeEntryName(entry.name), entry.bytes());
  }

  const workbook = textOf(byName.get("xl/workbook.xml"));
  const rels = textOf(byName.get("xl/_rels/workbook.xml.rels"));

  if (!workbook) panic("XLSX invalido: xl/workbook.xml ausente.");

  const sheets = parseWorkbookSheets(workbook);
  const target = sheets.find((s) => matchSheet(s.name));

  if (!target) {
    return panic(
      `XLSX: aba nao encontrada. Disponiveis: ${sheets.map((s) => s.name).join(", ")}`
    );
  }

  const sheetPath = resolveSheetPath(rels, target.rid);

  if (!sheetPath) {
    return panic(`XLSX: rel ${target.rid} nao mapeia para um worksheet.`);
  }

  const sheetXml = textOf(byName.get(`xl/${sheetPath}`));

  if (!sheetXml) {
    return panic(`XLSX: worksheet xl/${sheetPath} ausente.`);
  }

  const shared = parseSharedStrings(textOf(byName.get("xl/sharedStrings.xml")));

  return parseWorksheet(sheetXml, shared);
}

/**
 * Mapeia as linhas de dados da aba de municipios para registros tipados,
 * filtrando linhas sem cod_ibge valido (cabecalhos/rodapes).
 */
export type MunicipioRow = {
  codIbge: string;
  nome: string;
  uf: string;
  indicador1: number | null;
  nota1: NotaCapag | null;
  indicador2: number | null;
  nota2: NotaCapag | null;
  indicador3: number | null;
  nota3: NotaCapag | null;
  capag: NotaCapag | null;
};

export function mapMunicipiosRows(rows: SheetRow[]): MunicipioRow[] {
  const c = MUNICIPIOS_XLSX.col;
  const out: MunicipioRow[] = [];

  for (const row of rows) {
    const codIbge = normalizeCodIbge(row[c.codIbge]);

    if (!codIbge) continue;

    const uf = (row[c.uf] ?? "").trim().toUpperCase();

    if (uf.length !== 2) continue;

    out.push({
      codIbge,
      nome: (row[c.nome] ?? "").trim(),
      uf,
      indicador1: parseIndicador(row[c.indicador1]),
      nota1: parseNota(row[c.nota1]),
      indicador2: parseIndicador(row[c.indicador2]),
      nota2: parseNota(row[c.nota2]),
      indicador3: parseIndicador(row[c.indicador3]),
      nota3: parseNota(row[c.nota3]),
      capag: parseNota(row[c.capag]),
    });
  }

  return out;
}

/** Cabecalho esperado do CSV de estados, mapeado para nossos campos. */
export type EstadoRow = {
  uf: string;
  indicador1: number | null;
  nota1: NotaCapag | null;
  indicador2: number | null;
  nota2: NotaCapag | null;
  indicador3: number | null;
  nota3: NotaCapag | null;
  capag: NotaCapag | null;
  qualidadeInfo: string;
  observacao: string;
};

/**
 * Mapeia as linhas (ja em string[][]) do CSV de estados.
 * Ordem das colunas (verificada): UF; Indicador 1; Nota 1; Indicador 2; Nota 2;
 * Indicador 3; Nota 3; Classificacao da CAPAG; Qualidade; Observacao.
 * `rows` deve EXCLUIR a linha de cabecalho.
 */
export function mapEstadosRows(rows: SheetRow[]): EstadoRow[] {
  const out: EstadoRow[] = [];

  for (const row of rows) {
    const uf = (row[0] ?? "").trim().toUpperCase();

    if (uf.length !== 2 || !/^[A-Z]{2}$/.test(uf)) continue;

    out.push({
      uf,
      indicador1: parseIndicador(row[1]),
      nota1: parseNota(row[2]),
      indicador2: parseIndicador(row[3]),
      nota2: parseNota(row[4]),
      indicador3: parseIndicador(row[5]),
      nota3: parseNota(row[6]),
      capag: parseNota(row[7]),
      qualidadeInfo: (row[8] ?? "").trim(),
      observacao: (row[9] ?? "").trim(),
    });
  }

  return out;
}

// ----------------------- internos XLSX -----------------------

function normalizeEntryName(name: string): string {
  return name.replace(/^\/+/, "");
}

function textOf(bytes: Uint8Array | undefined): string {
  if (!bytes) return "";

  return new TextDecoder("utf-8").decode(bytes);
}

function parseWorkbookSheets(xml: string): SheetRef[] {
  const sheets: SheetRef[] = [];
  const re = /<sheet\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const name = attrAny(attrs, "name");
    const rid = attrAny(attrs, "r:id") ?? attrAny(attrs, "id");

    if (name !== null && rid !== null) {
      sheets.push({ name: decodeXmlEntities(name), rid });
    }
  }

  return sheets;
}

function resolveSheetPath(relsXml: string, rid: string): string | null {
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(relsXml))) {
    const attrs = m[1];

    if (attrAny(attrs, "Id") === rid) {
      const target = attrAny(attrs, "Target");

      if (target) return target.replace(/^\/?xl\//, "").replace(/^\/+/, "");
    }
  }

  return null;
}

function parseSharedStrings(xml: string): string[] {
  if (!xml) return [];

  const result: string[] = [];
  const re = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(xml))) {
    const inner = m[1];
    const parts = [...inner.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXmlEntities(t[1])
    );

    result.push(parts.join(""));
  }

  return result;
}

function parseWorksheet(xml: string, shared: string[]): SheetRow[] {
  const rows: SheetRow[] = [];
  const rowRe = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
  let rm: RegExpExecArray | null;

  while ((rm = rowRe.exec(xml))) {
    const cells: SheetRow = [];
    const cellRe = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;

    while ((cm = cellRe.exec(rm[1]))) {
      const attrs = cm[1];
      const body = cm[2] ?? "";
      const ref = attrAny(attrs, "r");
      const type = attrAny(attrs, "t");
      const colIndex = ref ? colLetterToIndex(ref.replace(/\d+/g, "")) : cells.length;

      cells[colIndex] = decodeCellValue(type, body, shared);
    }

    // Preenche buracos com string vazia para indices estaveis.
    for (let i = 0; i < cells.length; i++) {
      if (cells[i] === undefined) cells[i] = "";
    }

    rows.push(cells);
  }

  return rows;
}

function decodeCellValue(
  type: string | null,
  body: string,
  shared: string[]
): string {
  if (type === "inlineStr") {
    const parts = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) =>
      decodeXmlEntities(t[1])
    );

    return parts.join("");
  }

  const vMatch = body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/);
  const raw = vMatch ? vMatch[1] : "";

  if (type === "s") {
    const idx = Number(raw);

    return Number.isInteger(idx) ? shared[idx] ?? "" : "";
  }

  // 'str' (formula cacheada), 'n', 'b', boolean, ou sem tipo -> valor textual.
  return decodeXmlEntities(raw);
}

function attrAny(attrs: string, name: string): string | null {
  const re = new RegExp(`(?:^|\\s)${escapeRe(name)}\\s*=\\s*"([^"]*)"`);
  const m = attrs.match(re);

  return m ? m[1] : null;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&");
}
