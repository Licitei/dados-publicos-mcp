import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const simples = pgTable(
  "simples",
  {
    id: serial("id").primaryKey(),
    cnpjBasico: text("cnpj_basico"),
    opcaoSimples: text("opcao_simples"),
    dataOpcaoSimples: text("data_opcao_simples"),
    dataExclusaoSimples: text("data_exclusao_simples"),
    opcaoMei: text("opcao_mei"),
    dataOpcaoMei: text("data_opcao_mei"),
    dataExclusaoMei: text("data_exclusao_mei"),
  },
  (t) => [index("simples_cnpj_basico").on(t.cnpjBasico)]
);
