import { boolean, index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const fornecedor = pgTable(
  "fornecedor",
  {
    id: serial("id").primaryKey(),
    cnpj: text("cnpj"),
    cpf: text("cpf"),
    nomeRazaoSocial: text("nome_razao_social"),
    ativo: boolean("ativo").notNull(),
    habilitadoLicitar: boolean("habilitado_licitar").notNull(),
    ufSigla: text("uf_sigla"),
    nomeMunicipio: text("nome_municipio"),
    nomeMunicipioNormalizado: text("nome_municipio_normalizado").notNull(),
    codigoCnae: integer("codigo_cnae"),
    nomeCnae: text("nome_cnae"),
    naturezaJuridicaNome: text("natureza_juridica_nome"),
    porteEmpresaNome: text("porte_empresa_nome"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("fornecedor_cnpj").on(t.cnpj),
    index("fornecedor_uf").on(t.ufSigla),
    index("fornecedor_cnae").on(t.codigoCnae),
    index("fornecedor_municipio_trgm").using(
      "gin",
      t.nomeMunicipioNormalizado.op("gin_trgm_ops")
    ),
    index("fornecedor_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
  ]
);
