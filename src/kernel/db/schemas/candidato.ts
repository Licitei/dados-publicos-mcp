import { index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const candidato = pgTable(
  "candidato",
  {
    id: serial("id").primaryKey(),
    sqCandidato: text("sq_candidato"),
    cpf: text("cpf"),
    nome: text("nome"),
    nomeUrna: text("nome_urna"),
    anoEleicao: integer("ano_eleicao"),
    ufSigla: text("uf_sigla"),
    ueSigla: text("ue_sigla"),
    cargoCodigo: text("cargo_codigo"),
    cargoDescricao: text("cargo_descricao"),
    partidoNumero: text("partido_numero"),
    partidoSigla: text("partido_sigla"),
    situacaoTurno: text("situacao_turno"),
    dataNascimento: text("data_nascimento"),
    ocupacao: text("ocupacao"),
    busca: text("busca").notNull(),
  },
  (t) => [
    index("candidato_cpf").on(t.cpf),
    index("candidato_sq").on(t.sqCandidato),
    index("candidato_busca_bm25")
      .using("bm25", t.busca)
      .with({ text_config: "portuguese" }),
    index("candidato_busca_trgm").using("gin", t.busca.op("gin_trgm_ops")),
  ]
);
