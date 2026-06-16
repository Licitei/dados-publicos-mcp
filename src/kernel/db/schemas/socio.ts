import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const socio = pgTable(
  "socio",
  {
    id: serial("id").primaryKey(),
    cnpjBasico: text("cnpj_basico"),
    identificadorSocio: text("identificador_socio"),
    nomeSocio: text("nome_socio"),
    nomeSocioNorm: text("nome_socio_norm"),
    cnpjCpfSocio: text("cnpj_cpf_socio"),
    cpfVisivel: text("cpf_visivel"),
    qualificacao: text("qualificacao"),
    dataEntrada: text("data_entrada"),
    faixaEtaria: text("faixa_etaria"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("socio_cnpj_basico").on(t.cnpjBasico),
    index("socio_cpf").on(t.cnpjCpfSocio),
    index("socio_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("socio_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
