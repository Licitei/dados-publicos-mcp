import { Schema } from "effect";
import * as Rec from "effect/Record";
import * as Arr from "effect/Array";
import * as Str from "effect/String";
import type { DuckTable } from "../../kernel/duck/duck";

export const tcePrUrl = (year: number) =>
  `https://servicos.tce.pr.gov.br/servicos/arquivos/dadosabertos/MuralDeLicitacoes/${year}_mural_de_licitacoes_base_de_dados.csv`;
export const TcePrYears = Schema.Array(
  Schema.Finite.pipe(
    Schema.check(
      Schema.isInt(),
      Schema.isGreaterThanOrEqualTo(2000),
      Schema.isLessThanOrEqualTo(2100)
    )
  )
).pipe(Schema.check(Schema.isMinLength(1), Schema.isMaxLength(5)));
export const tcePrTable: DuckTable = {
  name: "tce_pr_licitacao",
  key: "__id",
  columns: {
    __id: "VARCHAR",
    __ano: "INTEGER",
    __fonte: "VARCHAR",
    __busca: "VARCHAR",
    dsModalidadeLicitacao: "VARCHAR",
    nmRazaoSocial: "VARCHAR",
    nrDocumento: "VARCHAR",
    cdIBGE: "VARCHAR",
    nmMunicipio: "VARCHAR",
    nrAno: "VARCHAR",
    nrProcessoEdital: "VARCHAR",
    dsTipoAvaliacao: "VARCHAR",
    dsObjeto: "VARCHAR",
    nrDotacaoOrcamentaria: "VARCHAR",
    dtAberturaLicitacao: "VARCHAR",
    dtLancamentoPublicacao: "VARCHAR",
    vlReferencia: "DOUBLE",
    nrEditalOrigem: "VARCHAR",
    dtCancelamento: "VARCHAR",
    dhRegistro: "VARCHAR",
    dhAtualizacao: "VARCHAR",
    dhRegistroCancelamento: "VARCHAR",
    dtAberturaLicitacaoNova: "VARCHAR",
    dtAtualizacaodtAbertura: "VARCHAR",
    dtAtualizacaodtAberturaNova: "VARCHAR",
    flRecursoInternacional: "VARCHAR",
    flPrioridadeContratacaoME: "VARCHAR",
    flExclusivoEPPME: "VARCHAR",
    flCotaParticipacaoEPPME: "VARCHAR",
    nrPercentualParticipacaoEPPME: "DOUBLE",
    flExigeSubcontratacaoEPPME: "VARCHAR",
    flvlSigiloso: "VARCHAR",
  },
  search: ["__busca"],
};
export const tcePrColumns = Arr.filter(
  Rec.keys(tcePrTable.columns),
  (column) => !Str.startsWith("__")(column)
);
export const TcePrRaw = Schema.Struct(
  Rec.map(
    Rec.filter(tcePrTable.columns, (_, column) => tcePrColumns.includes(column)),
    () => Schema.String
  )
);
const TcePrErrorCode = Schema.Literals(["tce-pr.SCOPE", "tce-pr.DOWNLOAD", "tce-pr.PARSE"]);
export class TcePrError extends Schema.TaggedError<TcePrError, { readonly brand: unique symbol }>()(
  "TcePrError",
  { code: TcePrErrorCode }
) {
  override get message() {
    return this.code === "tce-pr.SCOPE"
      ? "Informe entre um e cinco anos válidos para o Mural de Licitações do TCE-PR."
      : this.code === "tce-pr.PARSE"
        ? "O cabeçalho ou os registros do Mural de Licitações do TCE-PR mudaram; o índice anterior foi preservado."
        : "Falha ao baixar o CSV anual do Mural de Licitações do TCE-PR.";
  }
}
