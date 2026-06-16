import {
  doublePrecision,
  index,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

export const convenio = pgTable(
  "convenio",
  {
    id: serial("id").primaryKey(),
    nrConvenio: text("nr_convenio"),
    idProposta: text("id_proposta"),
    situacao: text("situacao"),
    dataPublicacao: text("data_publicacao"),
    vigenciaInicio: text("vigencia_inicio"),
    vigenciaFim: text("vigencia_fim"),
    valorGlobal: doublePrecision("valor_global"),
    valorRepasse: doublePrecision("valor_repasse"),
    cnpjProponente: text("cnpj_proponente"),
    docNormalizado: text("doc_normalizado"),
    nomeProponente: text("nome_proponente"),
    uf: text("uf"),
    municipio: text("municipio"),
    codMunicipioIbge: text("cod_municipio_ibge"),
    orgaoSuperior: text("orgao_superior"),
    orgao: text("orgao"),
    objeto: text("objeto"),
    modalidade: text("modalidade"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("convenio_nr").on(t.nrConvenio),
    index("convenio_doc").on(t.docNormalizado),
    index("convenio_municipio").on(t.codMunicipioIbge),
    index("convenio_uf").on(t.uf),
    index("convenio_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("convenio_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
