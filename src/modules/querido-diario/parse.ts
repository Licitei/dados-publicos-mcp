import { parseDataBr } from "../../core/parse/data-br";
import { normalize, onlyDigits } from "../../core/normalize";

/**
 * Parsing PURO (sem rede, sem disco) dos XMLs agregados do Querido Diario.
 *
 * Estrutura do XML (verificada em apsantana_1600600_2025.xml):
 *   <root>
 *     <meta>
 *       <uf>AP</uf>
 *       <ano_publicacao>2025</ano_publicacao>
 *       <municipio>Santana</municipio>
 *       <municipio_codigo_ibge>1600600</municipio_codigo_ibge>
 *     </meta>
 *     <diarios>
 *       <diario>
 *         <meta_diario>
 *           <url_arquivo_original>...</url_arquivo_original>
 *           <poder>executive</poder>
 *           <edicao_extra>Nao</edicao_extra>
 *           <numero_edicao>123</numero_edicao>
 *           <data_publicacao>15/01/2025</data_publicacao>
 *         </meta_diario>
 *         <conteudo>TEXTO OCR EXTRAIDO...</conteudo>
 *       </diario>
 *       ...
 *     </diarios>
 *   </root>
 *
 * Sem dependencia de XML parser externo: usamos regex tolerante (o conteudo e
 * OCR ruidoso, mas as tags estruturais sao estaveis). Decodificamos entidades
 * XML basicas e CDATA no <conteudo>.
 */

export type DiarioMeta = {
  uf: string;
  ano: number | null;
  municipio: string;
  territoryId: string;
};

export type DiarioRegistro = {
  territoryId: string;
  uf: string;
  municipio: string;
  ano: number | null;
  data: string | null; // aaaa-mm-dd normalizado
  poder: string | null;
  edicao: string | null;
  edicaoExtra: boolean;
  urlOriginal: string | null;
  conteudo: string;
};

/** Decodifica entidades XML basicas e remove wrappers CDATA. */
export function decodeXmlText(raw: string): string {
  let text = raw;

  // Remove wrappers CDATA preservando o conteudo interno.
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec: string) =>
      String.fromCodePoint(Number.parseInt(dec, 10))
    )
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex: string) =>
      String.fromCodePoint(Number.parseInt(hex, 16))
    )
    .replace(/&amp;/g, "&");
}

/** Extrai o texto da primeira ocorrencia de <tag>...</tag> (case-insensitive). */
function extractTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);

  if (!match) return null;

  return decodeXmlText(match[1]).trim();
}

/** Extrai o bloco bruto da primeira ocorrencia de <tag>...</tag> (sem decodificar). */
function extractRawBlock(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const match = xml.match(re);

  return match ? match[1] : null;
}

/** Le o <meta> raiz do XML agregado de um municipio. */
export function parseMeta(xml: string): DiarioMeta {
  const metaBlock = extractRawBlock(xml, "meta") ?? "";
  const anoRaw = extractTag(metaBlock, "ano_publicacao");

  return {
    uf: (extractTag(metaBlock, "uf") ?? "").toUpperCase(),
    ano: anoRaw ? Number.parseInt(anoRaw, 10) || null : null,
    municipio: extractTag(metaBlock, "municipio") ?? "",
    territoryId: onlyDigits(extractTag(metaBlock, "municipio_codigo_ibge") ?? ""),
  };
}

const diarioBlockRe = /<diario\b[^>]*>([\s\S]*?)<\/diario>/gi;

/**
 * Parseia um XML agregado de municipio em N registros de diario.
 * Funcao PURA: recebe a string XML (ja decodificada do ZIP) e devolve os
 * registros prontos para gravar no SQLite. Normaliza a data dd/mm/aaaa -> aaaa-mm-dd.
 */
export function parseMunicipioXml(xml: string): DiarioRegistro[] {
  const meta = parseMeta(xml);
  const registros: DiarioRegistro[] = [];

  let match: RegExpExecArray | null;
  diarioBlockRe.lastIndex = 0;

  while ((match = diarioBlockRe.exec(xml)) !== null) {
    const bloco = match[1];
    const metaDiario = extractRawBlock(bloco, "meta_diario") ?? bloco;
    const conteudoRaw = extractTag(bloco, "conteudo") ?? "";

    registros.push({
      territoryId: meta.territoryId,
      uf: meta.uf,
      municipio: meta.municipio,
      ano: meta.ano,
      data: parseDataBr(extractTag(metaDiario, "data_publicacao")),
      poder: extractTag(metaDiario, "poder"),
      edicao: extractTag(metaDiario, "numero_edicao"),
      edicaoExtra: parseSimNao(extractTag(metaDiario, "edicao_extra")),
      urlOriginal: extractTag(metaDiario, "url_arquivo_original"),
      conteudo: conteudoRaw,
    });
  }

  return registros;
}

/** "Sim"/"true"/"1" -> true; o resto -> false. Tolerante a acentos/caixa. */
export function parseSimNao(value: string | null | undefined): boolean {
  if (!value) return false;

  const n = normalize(value);

  return n === "sim" || n === "true" || n === "1" || n === "s";
}

/**
 * Extrai CNPJs (14 digitos) mencionados no texto OCR de um diario.
 * Aceita as mascaras 00.000.000/0001-00 e variacoes com espacos do OCR;
 * devolve apenas os digitos, deduplicados.
 */
const cnpjRe = /\b\d{2}[.\s]?\d{3}[.\s]?\d{3}[/\s]?\d{4}[-\s]?\d{2}\b/g;

export function extractCnpjs(texto: string): string[] {
  const found = new Set<string>();
  const matches = texto.match(cnpjRe) ?? [];

  for (const m of matches) {
    const digits = onlyDigits(m);

    if (digits.length === 14) found.add(digits);
  }

  return [...found];
}

/**
 * Extrai CPFs (11 digitos) mencionados no texto, tolerando a mascara comum em
 * editais com partes ocultas (ex.: "***.123.456-**"). Aqui so capturamos CPFs
 * totalmente numericos no formato 000.000.000-00 (ou com espacos do OCR).
 */
const cpfRe = /\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g;

export function extractCpfs(texto: string): string[] {
  const found = new Set<string>();
  const matches = texto.match(cpfRe) ?? [];

  for (const m of matches) {
    const digits = onlyDigits(m);

    // Evita capturar os 11 digitos centrais de um CNPJ ja contado.
    if (digits.length === 11) found.add(digits);
  }

  return [...found];
}

/** Conteudo normalizado (lowercase, sem acento) para o indice FTS5 tolerante a OCR. */
export function conteudoParaFts(conteudo: string): string {
  return normalize(conteudo);
}
