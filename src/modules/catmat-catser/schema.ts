/**
 * Tipos e mapeamento das respostas brutas da API CATMAT/CATSER para as linhas
 * gravadas no SQLite. Funcoes puras, testaveis sem rede.
 */

/** Envelope paginado padrao da API Compras.gov.br. */
export type PaginatedResponse<T> = {
  resultado: T[];
  totalRegistros: number;
  totalPaginas: number;
  paginasRestantes: number;
};

/** Item bruto de material (modulo-material/4_consultarItemMaterial). */
export type RawCatmatItem = {
  codigoItem: number;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoPdm: number | null;
  nomePdm: string | null;
  descricaoItem: string | null;
  statusItem: boolean | null;
  itemSustentavel: boolean | null;
  codigo_ncm: string | null;
  descricao_ncm: string | null;
  aplica_margem_preferencia: boolean | null;
  dataHoraAtualizacao: string | null;
};

/** Item bruto de servico (modulo-servico/6_consultarItemServico). */
export type RawCatserItem = {
  codigoServico: number;
  nomeServico: string | null;
  codigoSecao: number | null;
  nomeSecao: string | null;
  codigoDivisao: number | null;
  nomeDivisao: string | null;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoSubclasse: number | null;
  nomeSubclasse: string | null;
  codigoCpc: number | null;
  exclusivoCentralCompras: boolean | null;
  statusServico: boolean | null;
  dataHoraAtualizacao: string | null;
};

export type RawCatmatGrupo = {
  codigoGrupo: number;
  nomeGrupo: string | null;
  statusGrupo: boolean | null;
  dataHoraAtualizacao: string | null;
};

export type RawCatmatClasse = {
  codigoClasse: number;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  nomeClasse: string | null;
  statusClasse: boolean | null;
  dataHoraAtualizacao: string | null;
};

export type RawCatmatPdm = {
  codigoPdm: number;
  codigoGrupo: number | null;
  codigoClasse: number | null;
  nomeGrupo: string | null;
  nomeClasse: string | null;
  nomePdm: string | null;
  statusPdm: boolean | null;
  dataHoraAtualizacao: string | null;
};

/** Linha normalizada de item de material para o SQLite. */
export type CatmatItemRow = {
  codigoItem: number;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoPdm: number | null;
  nomePdm: string | null;
  descricaoItem: string | null;
  statusItem: number;
  itemSustentavel: number;
  codigoNcm: string | null;
  descricaoNcm: string | null;
  aplicaMargemPreferencia: number;
  dataHoraAtualizacao: string | null;
};

/** Linha normalizada de item de servico para o SQLite. */
export type CatserItemRow = {
  codigoServico: number;
  nomeServico: string | null;
  codigoSecao: number | null;
  nomeSecao: string | null;
  codigoDivisao: number | null;
  nomeDivisao: string | null;
  codigoGrupo: number | null;
  nomeGrupo: string | null;
  codigoClasse: number | null;
  nomeClasse: string | null;
  codigoSubclasse: number | null;
  nomeSubclasse: string | null;
  codigoCpc: number | null;
  exclusivoCentralCompras: number;
  statusServico: number;
  dataHoraAtualizacao: string | null;
};

/** Converte booleano/qualquer valor para 0/1 (SQLite nao tem boolean). */
export function toInt(value: unknown): number {
  return value ? 1 : 0;
}

/** Converte para number ou null (codigos podem vir null). */
export function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const n = Number(value);

  return Number.isFinite(n) ? n : null;
}

/** Converte para string limpa ou null. */
export function toStringOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;

  const s = String(value).trim();

  return s.length === 0 ? null : s;
}

export function mapCatmatItem(raw: RawCatmatItem): CatmatItemRow {
  return {
    codigoItem: Number(raw.codigoItem),
    codigoGrupo: toNumberOrNull(raw.codigoGrupo),
    nomeGrupo: toStringOrNull(raw.nomeGrupo),
    codigoClasse: toNumberOrNull(raw.codigoClasse),
    nomeClasse: toStringOrNull(raw.nomeClasse),
    codigoPdm: toNumberOrNull(raw.codigoPdm),
    nomePdm: toStringOrNull(raw.nomePdm),
    descricaoItem: toStringOrNull(raw.descricaoItem),
    statusItem: toInt(raw.statusItem),
    itemSustentavel: toInt(raw.itemSustentavel),
    codigoNcm: toStringOrNull(raw.codigo_ncm),
    descricaoNcm: toStringOrNull(raw.descricao_ncm),
    aplicaMargemPreferencia: toInt(raw.aplica_margem_preferencia),
    dataHoraAtualizacao: toStringOrNull(raw.dataHoraAtualizacao),
  };
}

export function mapCatserItem(raw: RawCatserItem): CatserItemRow {
  return {
    codigoServico: Number(raw.codigoServico),
    nomeServico: toStringOrNull(raw.nomeServico),
    codigoSecao: toNumberOrNull(raw.codigoSecao),
    nomeSecao: toStringOrNull(raw.nomeSecao),
    codigoDivisao: toNumberOrNull(raw.codigoDivisao),
    nomeDivisao: toStringOrNull(raw.nomeDivisao),
    codigoGrupo: toNumberOrNull(raw.codigoGrupo),
    nomeGrupo: toStringOrNull(raw.nomeGrupo),
    codigoClasse: toNumberOrNull(raw.codigoClasse),
    nomeClasse: toStringOrNull(raw.nomeClasse),
    codigoSubclasse: toNumberOrNull(raw.codigoSubclasse),
    nomeSubclasse: toStringOrNull(raw.nomeSubclasse),
    codigoCpc: toNumberOrNull(raw.codigoCpc),
    exclusivoCentralCompras: toInt(raw.exclusivoCentralCompras),
    statusServico: toInt(raw.statusServico),
    dataHoraAtualizacao: toStringOrNull(raw.dataHoraAtualizacao),
  };
}
