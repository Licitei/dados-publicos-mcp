import { indexByKey, pickFirst, numeroBr } from "../../kernel/csv/fields";
import { publicDocument } from "../../kernel/text/document";
import { normalize, onlyDigits } from "../../kernel/text/normalize";
import { Match, Schema } from "effect";
import type { DuckTable } from "../../kernel/duck/duck";

export const PortalDataset = Schema.Literals([
  "pep",
  "cpgf",
  "emendas-parlamentares",
  "servidores",
]);
export type PortalDataset = (typeof PortalDataset)["Type"];
export const PortalRequest = Schema.Struct({
  dataset: PortalDataset,
  mes: Schema.optionalKey(
    Schema.String.pipe(Schema.check(Schema.isPattern(/^\d{4}-(0[1-9]|1[0-2])$/)))
  ),
});
export const PortalSnapshot = Schema.Struct({
  periodo: Schema.String,
  bytes: Schema.Uint8Array,
  url: Schema.String,
});

const sharedColumns = {
  id: "VARCHAR",
  periodo: "VARCHAR",
  fonte: "VARCHAR",
  busca: "VARCHAR",
} satisfies DuckTable["columns"];
export const pepTable: DuckTable = {
  name: "portal_pep",
  key: "id",
  columns: {
    ...sharedColumns,
    documento: "VARCHAR",
    nome: "VARCHAR",
    funcao: "VARCHAR",
    orgao: "VARCHAR",
    dataInicio: "VARCHAR",
    dataFim: "VARCHAR",
    fimCarencia: "VARCHAR",
  },
  search: ["busca"],
};
export const cpgfTable: DuckTable = {
  name: "portal_cpgf",
  key: "id",
  columns: {
    ...sharedColumns,
    documento: "VARCHAR",
    cnpj: "VARCHAR",
    nome: "VARCHAR",
    documentoPortador: "VARCHAR",
    portador: "VARCHAR",
    orgao: "VARCHAR",
    unidadeGestora: "VARCHAR",
    transacao: "VARCHAR",
    dataTransacao: "VARCHAR",
    valor: "DOUBLE",
  },
  search: ["busca"],
};
export const emendaTable: DuckTable = {
  name: "portal_emenda",
  key: "id",
  columns: {
    ...sharedColumns,
    codigo: "VARCHAR",
    ano: "VARCHAR",
    tipo: "VARCHAR",
    autor: "VARCHAR",
    localidade: "VARCHAR",
    funcao: "VARCHAR",
    empenhado: "DOUBLE",
    liquidado: "DOUBLE",
    pago: "DOUBLE",
  },
  search: ["busca"],
};
export const servidorTable: DuckTable = {
  name: "portal_servidor",
  key: "id",
  columns: {
    ...sharedColumns,
    documento: "VARCHAR",
    nome: "VARCHAR",
    orgao: "VARCHAR",
    lotacao: "VARCHAR",
    cargo: "VARCHAR",
    situacao: "VARCHAR",
    vinculo: "VARCHAR",
  },
  search: ["busca"],
};
export const portalTables: Record<PortalDataset, DuckTable> = {
  pep: pepTable,
  cpgf: cpgfTable,
  "emendas-parlamentares": emendaTable,
  servidores: servidorTable,
};

const sharedFields = {
  id: Schema.String,
  periodo: Schema.String,
  fonte: Schema.String,
  busca: Schema.String,
};
const required = Schema.String.pipe(Schema.check(Schema.isMinLength(1)));
const PepRow = Schema.Struct({
  ...sharedFields,
  documento: required,
  nome: required,
  funcao: Schema.String,
  orgao: Schema.String,
  dataInicio: Schema.String,
  dataFim: Schema.String,
  fimCarencia: Schema.String,
});
const CpgfRow = Schema.Struct({
  ...sharedFields,
  documento: Schema.String,
  cnpj: Schema.NullOr(Schema.String),
  nome: Schema.String,
  documentoPortador: Schema.String,
  portador: Schema.String,
  orgao: Schema.String,
  unidadeGestora: Schema.String,
  transacao: Schema.String,
  dataTransacao: required,
  valor: Schema.Finite,
});
const EmendaRow = Schema.Struct({
  ...sharedFields,
  codigo: required,
  ano: Schema.String,
  tipo: Schema.String,
  autor: Schema.String,
  localidade: Schema.String,
  funcao: Schema.String,
  empenhado: Schema.NullOr(Schema.Finite),
  liquidado: Schema.NullOr(Schema.Finite),
  pago: Schema.NullOr(Schema.Finite),
});
const ServidorRow = Schema.Struct({
  ...sharedFields,
  documento: required,
  nome: required,
  orgao: Schema.String,
  lotacao: Schema.String,
  cargo: Schema.String,
  situacao: Schema.String,
  vinculo: Schema.String,
});
const PortalMapping = Schema.Struct({
  dataset: PortalDataset,
  row: Schema.Record(Schema.String, Schema.String),
  file: Schema.String,
  position: Schema.Finite,
  periodo: Schema.String,
  url: Schema.String,
});

const PortalErrorCode = Schema.Literals([
  "portal.DOWNLOAD",
  "portal.BLOCKED",
  "portal.MISSING",
  "portal.PARSE",
  "portal.EMPTY",
]);
export class PortalError extends Schema.TaggedError<
  PortalError,
  { readonly brand: unique symbol }
>()("PortalError", {
  code: PortalErrorCode,
  dataset: PortalDataset,
  cause: Schema.optional(Schema.String),
}) {
  override get message() {
    return this.code === "portal.BLOCKED"
      ? `O Portal da Transparência bloqueou o download de ${this.dataset} (HTTP 403); não foi usado um espelho defasado.`
      : this.code === "portal.MISSING"
        ? `Não foi encontrado período recente de ${this.dataset} no Portal da Transparência.`
        : this.code === "portal.EMPTY"
          ? `O arquivo de ${this.dataset} não contém registros esperados; o índice anterior foi preservado.`
          : this.code === "portal.PARSE"
            ? `Formato inesperado do arquivo ${this.dataset} do Portal da Transparência.`
            : `Falha ao baixar ${this.dataset} do Portal da Transparência.`;
  }
}

export const portalRow = (spec: (typeof PortalMapping)["Type"]) => {
  const fields = indexByKey(spec.row);
  const pick = (...keys: readonly string[]) => pickFirst(fields, keys);
  const shared = {
    id: `${spec.periodo}:${spec.file}:${spec.position}`,
    periodo: spec.periodo,
    fonte: spec.url,
  };
  return Match.value(spec.dataset).pipe(
    Match.when("pep", () => {
      const nome = pick("Nome_PEP", "Nome");
      return Schema.decodeEffect(PepRow)({
        ...shared,
        documento: publicDocument(pick("CPF")),
        nome,
        funcao: pick("Descricao_Funcao", "Função"),
        orgao: pick("Nome_Orgao", "Órgão"),
        dataInicio: pick("Data_Inicio_Exercicio"),
        dataFim: pick("Data_Fim_Exercicio"),
        fimCarencia: pick("Data_Fim_Carencia"),
        busca: normalize(nome),
      });
    }),
    Match.when("cpgf", () => {
      const documento = publicDocument(pick("CNPJ ou CPF Favorecido", "CPF/CNPJ Favorecido"));
      const nome = pick("Nome Favorecido");
      const portador = pick("Nome Portador");
      return Schema.decodeUnknownEffect(CpgfRow)({
        ...shared,
        documento,
        cnpj: onlyDigits(documento).length === 14 ? onlyDigits(documento) : null,
        nome,
        documentoPortador: publicDocument(pick("CPF Portador")),
        portador,
        orgao: pick("Nome Órgão"),
        unidadeGestora: pick("Nome Unidade Gestora"),
        transacao: pick("Transação"),
        dataTransacao: pick("Data Transação"),
        valor: numeroBr(pick("Valor Transação")),
        busca: normalize(`${nome} ${portador}`),
      });
    }),
    Match.when("emendas-parlamentares", () => {
      const autor = pick("Nome do Autor da Emenda", "Nome Autor", "Autor da Emenda");
      const localidade = pick("Localidade de aplicação do recurso", "Localidade");
      return Schema.decodeEffect(EmendaRow)({
        ...shared,
        codigo: pick("Código da Emenda", "Código Emenda"),
        ano: pick("Ano da Emenda", "Ano Emenda"),
        tipo: pick("Tipo de Emenda", "Tipo Emenda"),
        autor,
        localidade,
        funcao: pick("Função"),
        empenhado: numeroBr(pick("Valor Empenhado (R$)", "Valor Empenhado")),
        liquidado: numeroBr(pick("Valor Liquidado (R$)", "Valor Liquidado")),
        pago: numeroBr(pick("Valor Pago (R$)", "Valor Pago")),
        busca: normalize(`${autor} ${localidade}`),
      });
    }),
    Match.when("servidores", () => {
      const nome = pick("NOME");
      return Schema.decodeEffect(ServidorRow)({
        ...shared,
        documento: publicDocument(pick("CPF")),
        nome,
        orgao: pick("ORG_LOTACAO", "ORG_EXERCICIO"),
        lotacao: pick("UORG_LOTACAO", "UORG_EXERCICIO"),
        cargo: pick("DESCRICAO_CARGO"),
        situacao: pick("SITUACAO_VINCULO"),
        vinculo: pick("REGIME_JURIDICO", "TIPO_VINCULO"),
        busca: normalize(nome),
      });
    }),
    Match.exhaustive
  );
};
