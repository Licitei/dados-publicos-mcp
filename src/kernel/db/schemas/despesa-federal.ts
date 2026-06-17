import {
  doublePrecision,
  index,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const despesaFederal = pgTable(
  "despesa_federal",
  {
    id: serial("id").primaryKey(),
    anoMes: text("ano_mes"),
    codOrgaoSuperior: text("cod_orgao_superior"),
    nomeOrgaoSuperior: text("nome_orgao_superior"),
    codOrgao: text("cod_orgao"),
    nomeOrgao: text("nome_orgao"),
    codFuncao: text("cod_funcao"),
    nomeFuncao: text("nome_funcao"),
    codPrograma: text("cod_programa"),
    nomePrograma: text("nome_programa"),
    codAcao: text("cod_acao"),
    nomeAcao: text("nome_acao"),
    uf: text("uf"),
    municipio: text("municipio"),
    nomeElemento: text("nome_elemento"),
    valorEmpenhado: doublePrecision("valor_empenhado"),
    valorLiquidado: doublePrecision("valor_liquidado"),
    valorPago: doublePrecision("valor_pago"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("despesa_federal_orgao_sup").on(t.codOrgaoSuperior),
    index("despesa_federal_funcao").on(t.codFuncao),
    index("despesa_federal_uf").on(t.uf),
    index("despesa_federal_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("despesa_federal_busca_trgm").using(
      "gin",
      t.busca.op("gin_trgm_ops")
    ),
  ]
);
