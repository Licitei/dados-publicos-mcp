import { index, pgTable, serial, text } from "drizzle-orm/pg-core";

export const estabelecimento = pgTable(
  "estabelecimento",
  {
    id: serial("id").primaryKey(),
    cnpjCompleto: text("cnpj_completo"),
    cnpjBasico: text("cnpj_basico"),
    cnpjOrdem: text("cnpj_ordem"),
    cnpjDv: text("cnpj_dv"),
    matrizFilial: text("matriz_filial"),
    nomeFantasia: text("nome_fantasia"),
    situacaoCadastral: text("situacao_cadastral"),
    dataSituacao: text("data_situacao"),
    motivoSituacao: text("motivo_situacao"),
    dataInicioAtividade: text("data_inicio_atividade"),
    cnaePrincipal: text("cnae_principal"),
    cnaeSecundario: text("cnae_secundario"),
    uf: text("uf"),
    municipio: text("municipio"),
    bairro: text("bairro"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    cep: text("cep"),
    ddd: text("ddd"),
    telefone: text("telefone"),
    email: text("email"),
    porte: text("porte"),
  },
  (t) => [
    index("estabelecimento_cnpj_completo").on(t.cnpjCompleto),
    index("estabelecimento_cnpj_basico").on(t.cnpjBasico),
    index("estabelecimento_cnae").on(t.cnaePrincipal),
    index("estabelecimento_uf").on(t.uf),
    index("estabelecimento_municipio").on(t.municipio),
    index("estabelecimento_situacao").on(t.situacaoCadastral),
  ]
);
