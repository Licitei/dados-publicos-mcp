/**
 * Mapeamento PURO (sem rede, sem IO) dos registros crus da API de Consulta v1
 * do PNCP para as linhas gravadas no SQLite. Shapes verificados field-by-field
 * na sintese:
 *
 * - contratacoes/publicacao e /contratos usam objetos ANINHADOS
 *   orgaoEntidade{cnpj,razaoSocial,esferaId,poderId} e
 *   unidadeOrgao{codigoIbge,municipioNome,ufSigla,...}.
 * - /atas usa shape FLAT (CORRECAO da sintese): vigenciaInicio/vigenciaFim,
 *   cnpjOrgao/nomeOrgao, codigoUnidadeOrgao, objetoContratacao,
 *   numeroAtaRegistroPreco; NAO ha objeto orgaoEntidade/unidadeOrgao aninhado
 *   nem codigoIbge nem sequencialAta.
 *
 * Todas as funcoes aqui sao testaveis com objetos JS de fixture.
 */

export type ContratacaoRow = {
  numeroControlePNCP: string;
  anoCompra: number | null;
  sequencialCompra: number | null;
  objetoCompra: string;
  modalidadeId: number | null;
  modalidadeNome: string | null;
  situacaoCompraNome: string | null;
  valorTotalEstimado: number | null;
  valorTotalHomologado: number | null;
  dataPublicacaoPncp: string | null;
  dataAberturaProposta: string | null;
  dataEncerramentoProposta: string | null;
  dataAtualizacaoGlobal: string | null;
  orgaoCnpj: string | null;
  orgaoRazaoSocial: string | null;
  esferaId: string | null;
  poderId: string | null;
  codigoIbge: string | null;
  municipioNome: string | null;
  ufSigla: string | null;
  srp: number | null;
};

export type ContratoRow = {
  numeroControlePNCP: string;
  numeroControlePncpCompra: string | null;
  anoContrato: number | null;
  sequencialContrato: number | null;
  objetoContrato: string;
  niFornecedor: string | null;
  tipoPessoa: string | null;
  nomeRazaoSocialFornecedor: string;
  niFornecedorSubContratado: string | null;
  nomeFornecedorSubContratado: string | null;
  valorInicial: number | null;
  valorGlobal: number | null;
  valorAcumulado: number | null;
  dataAssinatura: string | null;
  dataVigenciaInicio: string | null;
  dataVigenciaFim: string | null;
  dataPublicacaoPncp: string | null;
  dataAtualizacaoGlobal: string | null;
  orgaoCnpj: string | null;
  orgaoRazaoSocial: string | null;
  codigoIbge: string | null;
  ufSigla: string | null;
  tipoContrato: string | null;
};

export type AtaRow = {
  numeroControlePNCPAta: string;
  numeroControlePNCPCompra: string | null;
  anoAta: number | null;
  numeroAtaRegistroPreco: string | null;
  objetoContratacao: string;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  dataAtualizacaoGlobal: string | null;
  cnpjOrgao: string | null;
  nomeOrgao: string | null;
  codigoUnidadeOrgao: string | null;
  ufSigla: string | null;
};

type Raw = Record<string, unknown>;

function asObject(value: unknown): Raw {
  return value && typeof value === "object" ? (value as Raw) : {};
}

function str(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function strOrEmpty(value: unknown): string {
  return str(value) ?? "";
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function bool01(value: unknown): number | null {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === null || value === undefined) return null;
  return value ? 1 : 0;
}

/**
 * Extrai o numeroControlePNCP de um registro, tolerando variacoes de chave
 * (a API usa numeroControlePNCP em contratacoes/contratos e
 * numeroControlePNCPAta em atas).
 */
export function pickNumeroControle(raw: Raw, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = str(raw[key]);
    if (value) return value;
  }
  return null;
}

/** Mapeia um registro cru de contratacoes/publicacao para ContratacaoRow. */
export function mapContratacao(raw: Raw): ContratacaoRow | null {
  const numeroControlePNCP = pickNumeroControle(raw, "numeroControlePNCP");
  if (!numeroControlePNCP) return null;

  const orgao = asObject(raw.orgaoEntidade);
  const unidade = asObject(raw.unidadeOrgao);

  return {
    numeroControlePNCP,
    anoCompra: num(raw.anoCompra),
    sequencialCompra: num(raw.sequencialCompra),
    objetoCompra: strOrEmpty(raw.objetoCompra),
    modalidadeId: num(raw.modalidadeId),
    modalidadeNome: str(raw.modalidadeNome),
    situacaoCompraNome: str(raw.situacaoCompraNome),
    valorTotalEstimado: num(raw.valorTotalEstimado),
    valorTotalHomologado: num(raw.valorTotalHomologado),
    dataPublicacaoPncp: str(raw.dataPublicacaoPncp),
    dataAberturaProposta: str(raw.dataAberturaProposta),
    dataEncerramentoProposta: str(raw.dataEncerramentoProposta),
    dataAtualizacaoGlobal:
      str(raw.dataAtualizacaoGlobal) ?? str(raw.dataAtualizacao),
    orgaoCnpj: str(orgao.cnpj),
    orgaoRazaoSocial: str(orgao.razaoSocial),
    esferaId: str(orgao.esferaId),
    poderId: str(orgao.poderId),
    codigoIbge: str(unidade.codigoIbge),
    municipioNome: str(unidade.municipioNome),
    ufSigla: str(unidade.ufSigla),
    srp: bool01(raw.srp),
  };
}

/** Mapeia um registro cru de /contratos para ContratoRow. */
export function mapContrato(raw: Raw): ContratoRow | null {
  const numeroControlePNCP = pickNumeroControle(raw, "numeroControlePNCP");
  if (!numeroControlePNCP) return null;

  const orgao = asObject(raw.orgaoEntidade);
  const unidade = asObject(raw.unidadeOrgao);

  return {
    numeroControlePNCP,
    numeroControlePncpCompra: str(raw.numeroControlePncpCompra),
    anoContrato: num(raw.anoContrato),
    sequencialContrato: num(raw.sequencialContrato),
    objetoContrato: strOrEmpty(raw.objetoContrato),
    niFornecedor: str(raw.niFornecedor),
    tipoPessoa: str(raw.tipoPessoa),
    nomeRazaoSocialFornecedor: strOrEmpty(raw.nomeRazaoSocialFornecedor),
    niFornecedorSubContratado: str(raw.niFornecedorSubContratado),
    nomeFornecedorSubContratado: str(raw.nomeFornecedorSubContratado),
    valorInicial: num(raw.valorInicial),
    valorGlobal: num(raw.valorGlobal),
    valorAcumulado: num(raw.valorAcumulado),
    dataAssinatura: str(raw.dataAssinatura),
    dataVigenciaInicio: str(raw.dataVigenciaInicio),
    dataVigenciaFim: str(raw.dataVigenciaFim),
    dataPublicacaoPncp: str(raw.dataPublicacaoPncp),
    dataAtualizacaoGlobal:
      str(raw.dataAtualizacaoGlobal) ?? str(raw.dataAtualizacao),
    orgaoCnpj: str(orgao.cnpj),
    orgaoRazaoSocial: str(orgao.razaoSocial),
    codigoIbge: str(unidade.codigoIbge),
    ufSigla: str(unidade.ufSigla),
    tipoContrato: str(raw.tipoContrato),
  };
}

/**
 * Mapeia um registro cru de /atas para AtaRow.
 * ATENCAO: atas usa shape FLAT (vigenciaInicio/Fim, cnpjOrgao, nomeOrgao,
 * codigoUnidadeOrgao, objetoContratacao, numeroAtaRegistroPreco) - NAO ha
 * orgaoEntidade/unidadeOrgao aninhados. Mantemos fallbacks tolerantes para
 * variacoes menores de chave sem reintroduzir o shape errado da spec.
 */
export function mapAta(raw: Raw): AtaRow | null {
  const numeroControlePNCPAta = pickNumeroControle(
    raw,
    "numeroControlePNCPAta",
    "numeroControlePncpAta",
    "numeroControlePNCP",
  );
  if (!numeroControlePNCPAta) return null;

  return {
    numeroControlePNCPAta,
    numeroControlePNCPCompra:
      str(raw.numeroControlePNCPCompra) ?? str(raw.numeroControlePncpCompra),
    anoAta: num(raw.anoAta),
    numeroAtaRegistroPreco: str(raw.numeroAtaRegistroPreco),
    objetoContratacao:
      strOrEmpty(raw.objetoContratacao) || strOrEmpty(raw.objetoCompra),
    vigenciaInicio: str(raw.vigenciaInicio),
    vigenciaFim: str(raw.vigenciaFim),
    dataAtualizacaoGlobal:
      str(raw.dataAtualizacaoGlobal) ?? str(raw.dataAtualizacao),
    cnpjOrgao: str(raw.cnpjOrgao),
    nomeOrgao: str(raw.nomeOrgao),
    codigoUnidadeOrgao: str(raw.codigoUnidadeOrgao),
    ufSigla: str(raw.ufSigla),
  };
}

/**
 * Le data[] de uma pagina da API de Consulta. A API retorna
 * { data, totalRegistros, totalPaginas, numeroPagina, paginasRestantes }.
 * Tolera tambem um array cru ou { items }.
 */
export function extractPageData(payload: unknown): {
  data: Raw[];
  totalRegistros: number | null;
  totalPaginas: number | null;
  paginasRestantes: number | null;
} {
  if (Array.isArray(payload)) {
    return {
      data: payload.filter(
        (item): item is Raw => !!item && typeof item === "object",
      ),
      totalRegistros: null,
      totalPaginas: null,
      paginasRestantes: null,
    };
  }

  const object = asObject(payload);
  const rawData = Array.isArray(object.data)
    ? object.data
    : Array.isArray(object.items)
      ? object.items
      : [];

  return {
    data: rawData.filter(
      (item): item is Raw => !!item && typeof item === "object",
    ),
    totalRegistros: num(object.totalRegistros),
    totalPaginas: num(object.totalPaginas),
    paginasRestantes: num(object.paginasRestantes),
  };
}

export type PncpEntidade = "contratacoes" | "contratos" | "atas";

/**
 * Mapeia uma pagina inteira de registros crus em linhas tipadas, descartando
 * registros sem chave primaria. Funcao pura, ideal para teste com fixtures.
 */
export function mapPageRows(
  entidade: "contratacoes",
  rows: Raw[],
): ContratacaoRow[];
export function mapPageRows(entidade: "contratos", rows: Raw[]): ContratoRow[];
export function mapPageRows(entidade: "atas", rows: Raw[]): AtaRow[];
export function mapPageRows(
  entidade: PncpEntidade,
  rows: Raw[],
): (ContratacaoRow | ContratoRow | AtaRow)[];
export function mapPageRows(
  entidade: PncpEntidade,
  rows: Raw[],
): (ContratacaoRow | ContratoRow | AtaRow)[] {
  const mapper =
    entidade === "contratacoes"
      ? mapContratacao
      : entidade === "contratos"
        ? mapContrato
        : mapAta;

  const out: (ContratacaoRow | ContratoRow | AtaRow)[] = [];
  for (const raw of rows) {
    const mapped = mapper(raw);
    if (mapped) out.push(mapped);
  }
  return out;
}
