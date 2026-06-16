import { index, integer, pgTable, serial, text } from "drizzle-orm/pg-core";

export const proposicaoAutor = pgTable(
  "proposicao_autor",
  {
    id: serial("id").primaryKey(),
    idProposicao: text("id_proposicao"),
    idDeputadoAutor: text("id_deputado_autor"),
    uriAutor: text("uri_autor"),
    nomeAutor: text("nome_autor"),
    nomeAutorNorm: text("nome_autor_norm"),
    proponente: integer("proponente"),
  },
  (t) => [
    index("proposicao_autor_prop").on(t.idProposicao),
    index("proposicao_autor_dep").on(t.idDeputadoAutor),
  ]
);
