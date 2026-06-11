import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import { Result } from "better-result";
import {
  cpfVisivel,
  montarCnpjCompleto,
  parseDominio,
  parseEmpresas,
  parseEstabelecimentos,
  parseSimples,
  parseSocios,
} from "../src/modules/receita-cnpj/mappers";
import {
  createSchema,
  insertDominio,
  insertEmpresas,
  insertEstabelecimentos,
  insertSimples,
  insertSocios,
} from "../src/modules/receita-cnpj/db";
import {
  buscarEmpresaPorNome,
  buscarSocioPorNome,
  consultarCnpj,
  filtrarEmpresas,
  sociosEmComum,
} from "../src/modules/receita-cnpj/service";
import { extrairPastasMensais } from "../src/modules/receita-cnpj/indexer";

/**
 * Codifica uma string para bytes ISO-8859-1 (Latin-1), como os CSVs da RFB.
 * (TextEncoder so faz UTF-8, entao mapeamos char->byte 0..255 manualmente.)
 */
function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

// ---------------------------------------------------------------------------
// Funcoes puras de parsing/mapeamento (com fixtures inline em Latin-1).
// ---------------------------------------------------------------------------

describe("mappers (puros, Latin-1)", () => {
  test("montarCnpjCompleto monta 14 digitos com padding", () => {
    expect(montarCnpjCompleto("12345", "1", "9")).toBe("00012345000109");
    expect(montarCnpjCompleto("00000000", "0001", "91")).toBe("00000000000191");
  });

  test("cpfVisivel extrai os 6 digitos centrais da mascara", () => {
    expect(cpfVisivel("***456789**")).toBe("456789");
    expect(cpfVisivel("12345678901")).toBe("456789");
    expect(cpfVisivel("")).toBe("");
  });

  test("parseEmpresas mapeia 7 colunas, capital BR e acentos Latin-1", () => {
    // Acentos: PADRÃO (Ã=0xC3 em Latin-1), CONSTRUÇÃO (Ç=0xC7)
    const csv =
      '"00000000";"PADRÃO CONSTRUÇÃO LTDA";"2062";"49";"5.000,50";"03";""\r\n' +
      '"00000001";"OUTRA EMPRESA SA";"2054";"49";"1000000,00";"05";""';
    const rows = parseEmpresas(latin1(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0].cnpj_basico).toBe("00000000");
    expect(rows[0].razao_social).toBe("PADRÃO CONSTRUÇÃO LTDA");
    expect(rows[0].razao_social_norm).toBe("padrao construcao ltda");
    expect(rows[0].capital_social).toBe(5000.5);
    expect(rows[0].porte_empresa).toBe("03");
    expect(rows[1].capital_social).toBe(1000000);
  });

  test("parseEstabelecimentos mapeia 30 colunas posicionais e monta CNPJ", () => {
    const cols = [
      "00000000", // cnpj_basico
      "0001", // cnpj_ordem
      "91", // cnpj_dv
      "1", // matriz/filial
      "PADARIA CENTRAL", // nome_fantasia
      "02", // situacao_cadastral
      "20200115", // data_situacao
      "00", // motivo
      "", // nome_cidade_exterior
      "105", // pais
      "20000301", // data_inicio_atividade
      "4711301", // cnae principal
      "4721102,4722901", // cnae secundaria
      "RUA", // tipo logradouro
      "DAS FLORES", // logradouro
      "100", // numero
      "SALA 2", // complemento
      "CENTRO", // bairro
      "01000000", // cep
      "SP", // uf
      "7107", // municipio (codigo RFB)
      "11", // ddd1
      "33334444", // telefone1
      "", // ddd2
      "", // telefone2
      "", // ddd_fax
      "", // fax
      "contato@exemplo.com", // email
      "", // situacao_especial
      "", // data_situacao_especial
    ];
    const csv = cols.map((c) => `"${c}"`).join(";");
    const rows = parseEstabelecimentos(latin1(csv));
    expect(rows).toHaveLength(1);
    const e = rows[0];
    expect(e.cnpj_completo).toBe("00000000000191");
    expect(e.nome_fantasia).toBe("PADARIA CENTRAL");
    expect(e.situacao_cadastral).toBe("02");
    expect(e.data_situacao_cadastral).toBe("2020-01-15");
    expect(e.data_inicio_atividade).toBe("2000-03-01");
    expect(e.cnae_fiscal_principal).toBe("4711301");
    expect(e.cnae_fiscal_secundaria).toBe("4721102,4722901");
    expect(e.uf).toBe("SP");
    expect(e.municipio).toBe("7107");
    expect(e.correio_eletronico).toBe("contato@exemplo.com");
  });

  test("parseSocios mapeia 11 colunas e CPF mascarado", () => {
    const csv =
      '"00000000";"2";"JOÃO DA SILVA";"***456789**";"49";"20100101";"105";"";"";"";"4"\r\n' +
      '"00000002";"1";"EMPRESA HOLDING SA";"11222333000181";"22";"20150601";"105";"";"";"";"0"';
    const rows = parseSocios(latin1(csv));
    expect(rows).toHaveLength(2);
    expect(rows[0].nome_socio).toBe("JOÃO DA SILVA");
    expect(rows[0].nome_socio_norm).toBe("joao da silva");
    expect(rows[0].cpf_visivel).toBe("456789");
    expect(rows[0].data_entrada_sociedade).toBe("2010-01-01");
    expect(rows[1].identificador_socio).toBe("1");
  });

  test("parseSimples mapeia 7 colunas e datas vazias viram null", () => {
    const csv =
      '"00000000";"S";"20070701";"00000000";"N";"00000000";"00000000"';
    const rows = parseSimples(latin1(csv));
    expect(rows).toHaveLength(1);
    expect(rows[0].opcao_simples).toBe("S");
    expect(rows[0].data_opcao_simples).toBe("2007-07-01");
    expect(rows[0].data_exclusao_simples).toBeNull();
    expect(rows[0].opcao_mei).toBe("N");
    expect(rows[0].data_opcao_mei).toBeNull();
  });

  test("parseDominio mapeia codigo/descricao com acentos Latin-1", () => {
    const csv = '"7107";"SÃO PAULO"\r\n"0001";"GUAJARÁ-MIRIM"';
    const rows = parseDominio(latin1(csv));
    expect(rows).toEqual([
      { codigo: "7107", descricao: "SÃO PAULO" },
      { codigo: "0001", descricao: "GUAJARÁ-MIRIM" },
    ]);
  });
});

// ---------------------------------------------------------------------------
// PROPFIND (puro): extracao das pastas mensais.
// ---------------------------------------------------------------------------

describe("extrairPastasMensais (PROPFIND XML)", () => {
  test("extrai e ordena desc as pastas YYYY-MM", () => {
    const xml = `<?xml version="1.0"?>
      <d:multistatus xmlns:d="DAV:">
        <d:response><d:href>/public.php/webdav/2023-05/</d:href></d:response>
        <d:response><d:href>/public.php/webdav/2026-05/</d:href></d:response>
        <d:response><d:href>/public.php/webdav/2025-12/</d:href></d:response>
      </d:multistatus>`;
    expect(extrairPastasMensais(xml)).toEqual([
      "2026-05",
      "2025-12",
      "2023-05",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Busca em SQLite :memory: populado a mao (sem rede, sem disco).
// ---------------------------------------------------------------------------

function makeDb(): Database {
  const db = new Database(":memory:");
  createSchema(db);

  insertDominio(db, "cnaes", [
    { codigo: "4711301", descricao: "Comercio de mercadorias" },
    { codigo: "4120400", descricao: "Construcao de edificios" },
  ]);
  insertDominio(db, "municipios", [{ codigo: "7107", descricao: "SAO PAULO" }]);
  insertDominio(db, "naturezas", [
    { codigo: "2062", descricao: "Sociedade Empresaria Limitada" },
  ]);
  insertDominio(db, "qualificacoes", [
    { codigo: "49", descricao: "Socio-Administrador" },
  ]);
  insertDominio(db, "motivos", [{ codigo: "00", descricao: "Sem motivo" }]);

  insertEmpresas(db, [
    {
      cnpj_basico: "00000000",
      razao_social: "PADRAO CONSTRUCAO LTDA",
      razao_social_norm: "padrao construcao ltda",
      natureza_juridica: "2062",
      qualificacao_responsavel: "49",
      capital_social: 5000.5,
      porte_empresa: "03",
      ente_federativo_responsavel: "",
    },
    {
      cnpj_basico: "00000001",
      razao_social: "ALFA SERVICOS LTDA",
      razao_social_norm: "alfa servicos ltda",
      natureza_juridica: "2062",
      qualificacao_responsavel: "49",
      capital_social: 1000,
      porte_empresa: "01",
      ente_federativo_responsavel: "",
    },
  ]);

  insertEstabelecimentos(db, [
    {
      cnpj_basico: "00000000",
      cnpj_ordem: "0001",
      cnpj_dv: "91",
      cnpj_completo: "00000000000191",
      identificador_matriz_filial: "1",
      nome_fantasia: "PADARIA CENTRAL",
      nome_fantasia_norm: "padaria central",
      situacao_cadastral: "02",
      data_situacao_cadastral: "2020-01-15",
      motivo_situacao_cadastral: "00",
      nome_cidade_exterior: "",
      pais: "105",
      data_inicio_atividade: "2000-03-01",
      cnae_fiscal_principal: "4711301",
      cnae_fiscal_secundaria: "4120400",
      logradouro: "DAS FLORES",
      numero: "100",
      complemento: "",
      bairro: "CENTRO",
      cep: "01000000",
      uf: "SP",
      municipio: "7107",
      ddd1: "11",
      telefone1: "33334444",
      correio_eletronico: "contato@exemplo.com",
    },
    {
      cnpj_basico: "00000001",
      cnpj_ordem: "0001",
      cnpj_dv: "10",
      cnpj_completo: "00000001000110",
      identificador_matriz_filial: "1",
      nome_fantasia: "ALFA",
      nome_fantasia_norm: "alfa",
      situacao_cadastral: "08",
      data_situacao_cadastral: "2022-05-10",
      motivo_situacao_cadastral: "00",
      nome_cidade_exterior: "",
      pais: "105",
      data_inicio_atividade: "2010-01-01",
      cnae_fiscal_principal: "4120400",
      cnae_fiscal_secundaria: "",
      logradouro: "AV BRASIL",
      numero: "200",
      complemento: "",
      bairro: "JARDIM",
      cep: "02000000",
      uf: "RJ",
      municipio: "6001",
      ddd1: "21",
      telefone1: "55556666",
      correio_eletronico: "",
    },
  ]);

  insertSocios(db, [
    {
      cnpj_basico: "00000000",
      identificador_socio: "2",
      nome_socio: "JOAO DA SILVA",
      nome_socio_norm: "joao da silva",
      cnpj_cpf_socio: "***456789**",
      cpf_visivel: "456789",
      qualificacao_socio: "49",
      data_entrada_sociedade: "2010-01-01",
      pais: "105",
      representante_legal: "",
      nome_representante: "",
      qualificacao_representante_legal: "",
      faixa_etaria: "4",
    },
    {
      cnpj_basico: "00000001",
      identificador_socio: "2",
      nome_socio: "JOAO DA SILVA",
      nome_socio_norm: "joao da silva",
      cnpj_cpf_socio: "***456789**",
      cpf_visivel: "456789",
      qualificacao_socio: "49",
      data_entrada_sociedade: "2012-06-01",
      pais: "105",
      representante_legal: "",
      nome_representante: "",
      qualificacao_representante_legal: "",
      faixa_etaria: "4",
    },
    {
      cnpj_basico: "00000001",
      identificador_socio: "2",
      nome_socio: "MARIA SOUZA",
      nome_socio_norm: "maria souza",
      cnpj_cpf_socio: "***111222**",
      cpf_visivel: "111222",
      qualificacao_socio: "22",
      data_entrada_sociedade: "2011-02-02",
      pais: "105",
      representante_legal: "",
      nome_representante: "",
      qualificacao_representante_legal: "",
      faixa_etaria: "5",
    },
  ]);

  insertSimples(db, [
    {
      cnpj_basico: "00000000",
      opcao_simples: "S",
      data_opcao_simples: "2007-07-01",
      data_exclusao_simples: null,
      opcao_mei: "N",
      data_opcao_mei: null,
      data_exclusao_mei: null,
    },
  ]);

  return db;
}

describe("consultarCnpj", () => {
  test("resolve CNPJ completo com empresa, dominios e Simples", () => {
    const db = makeDb();
    const res = consultarCnpj(db, "00.000.000/0001-91");
    expect(Result.isOk(res)).toBe(true);
    if (Result.isError(res)) throw new Error("esperava ok");
    const ficha = res.value as Record<string, any>;
    expect(ficha.cnpj).toBe("00000000000191");
    expect(ficha.razao_social).toBe("PADRAO CONSTRUCAO LTDA");
    expect(ficha.nome_fantasia).toBe("PADARIA CENTRAL");
    expect(ficha.situacao_cadastral).toBe("ativa");
    expect(ficha.cnae_principal_descricao).toBe("Comercio de mercadorias");
    expect(ficha.natureza_juridica_descricao).toBe(
      "Sociedade Empresaria Limitada",
    );
    expect(ficha.porte).toBe("empresa de pequeno porte");
    expect(ficha.endereco.municipio).toBe("SAO PAULO");
    expect(ficha.endereco.uf).toBe("SP");
    expect(ficha.simples.opcao_simples).toBe("S");
    db.close();
  });

  test("CNPJ invalido retorna erro", () => {
    const db = makeDb();
    const res = consultarCnpj(db, "123");
    expect(Result.isError(res)).toBe(true);
    db.close();
  });

  test("CNPJ inexistente retorna null", () => {
    const db = makeDb();
    const res = consultarCnpj(db, "99999999000199");
    expect(Result.isOk(res)).toBe(true);
    if (Result.isError(res)) throw new Error("esperava ok");
    expect(res.value).toBeNull();
    db.close();
  });
});

describe("buscarEmpresaPorNome (FTS5)", () => {
  test("encontra por razao social", () => {
    const db = makeDb();
    const out = buscarEmpresaPorNome(db, "construcao");
    expect(out.length).toBeGreaterThanOrEqual(1);
    expect(out[0].razao_social).toBe("PADRAO CONSTRUCAO LTDA");
    db.close();
  });

  test("encontra por nome fantasia", () => {
    const db = makeDb();
    const out = buscarEmpresaPorNome(db, "padaria");
    expect(out.some((r) => r.nome_fantasia === "PADARIA CENTRAL")).toBe(true);
    db.close();
  });
});

describe("buscarSocioPorNome (FTS5)", () => {
  test("lista todas as empresas de um socio", () => {
    const db = makeDb();
    const out = buscarSocioPorNome(db, "joao silva");
    const basicos = out.map((r) => r.cnpj_basico).sort();
    expect(basicos).toEqual(["00000000", "00000001"]);
    db.close();
  });

  test("filtra pelos 6 digitos visiveis do CPF", () => {
    const db = makeDb();
    const out = buscarSocioPorNome(db, "joao silva", { cpfVisivel: "456789" });
    expect(out.length).toBe(2);
    const vazio = buscarSocioPorNome(db, "joao silva", {
      cpfVisivel: "000000",
    });
    expect(vazio.length).toBe(0);
    db.close();
  });
});

describe("sociosEmComum", () => {
  test("detecta socio compartilhado entre dois CNPJs", () => {
    const db = makeDb();
    const out = sociosEmComum(db, ["00000000000191", "00000001000110"]);
    expect(out.length).toBe(1);
    expect(out[0].nome_socio).toBe("JOAO DA SILVA");
    expect(out[0].quantidade_empresas).toBe(2);
    expect((out[0].cnpjs_basicos as string[]).sort()).toEqual([
      "00000000",
      "00000001",
    ]);
    db.close();
  });

  test("retorna vazio com menos de 2 CNPJs distintos", () => {
    const db = makeDb();
    expect(sociosEmComum(db, ["00000000000191"]).length).toBe(0);
    db.close();
  });
});

describe("filtrarEmpresas", () => {
  test("filtra por UF", () => {
    const db = makeDb();
    const out = filtrarEmpresas(db, { uf: "SP" });
    expect(out.length).toBe(1);
    expect(out[0].cnpj).toBe("00000000000191");
    db.close();
  });

  test("filtra por CNAE principal ou secundario", () => {
    const db = makeDb();
    // 4120400 e principal do CNPJ ...01 e secundario do CNPJ ...00.
    const out = filtrarEmpresas(db, { cnae: "4120400" });
    const cnpjs = out.map((r) => r.cnpj).sort();
    expect(cnpjs).toEqual(["00000000000191", "00000001000110"]);
    db.close();
  });

  test("filtra por situacao cadastral (baixada)", () => {
    const db = makeDb();
    const out = filtrarEmpresas(db, { situacao: "baixada" });
    expect(out.length).toBe(1);
    expect(out[0].situacao_cadastral).toBe("baixada");
    db.close();
  });

  test("filtra por porte (ME)", () => {
    const db = makeDb();
    const out = filtrarEmpresas(db, { porte: "ME" });
    expect(out.length).toBe(1);
    expect(out[0].cnpj).toBe("00000001000110");
    db.close();
  });
});
