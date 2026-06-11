import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { headerKey, parseEfeitos, parseSancoes } from "../src/modules/sancoes-cgu/parse";
import {
  createSchema,
  insertEfeitos,
  insertSancoes,
  rebuildFts,
} from "../src/modules/sancoes-cgu/schema";
import {
  buscarSancionadoPorNome,
  sancoesVigentesNaData,
  verificarSancoes,
} from "../src/modules/sancoes-cgu/service";

/**
 * Codifica uma string em bytes ISO-8859-1 (Latin-1), como vem do CDN da CGU.
 * Cada code point < 256 vira um byte. Usado para exercitar o decode do parser.
 */
function latin1(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }

  return bytes;
}

// CSV CEIS minimo (delimitador ';', aspas, CRLF, ISO-8859-1, acentos).
const CEIS_CSV =
  '"CÓDIGO DA SANÇÃO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"RAZÃO SOCIAL - CADASTRO RECEITA";"CATEGORIA DA SANÇÃO";"NÚMERO DO PROCESSO";"DATA INÍCIO SANÇÃO";"DATA FINAL SANÇÃO";"ÓRGÃO SANCIONADOR";"UF ÓRGÃO SANCIONADOR";"FUNDAMENTAÇÃO LEGAL"\r\n' +
  '"100";"J";"00.000.000/0001-91";"Construções Ltda";"CONSTRUÇÕES SÃO JOSÉ LTDA";"Inidoneidade";"123/2020";"01/02/2020";"01/02/2025";"TCU";"DF";"Lei 8.666"\r\n' +
  '"101";"F";"123.456.789-00";"João da Silva";"";"Suspensão";"999/2021";"10/03/2021";"10/03/2099";"CGU";"SP";"Art. 7"\r\n';

test("headerKey normaliza acento, caixa e espacos repetidos", () => {
  expect(headerKey("RAZÃO SOCIAL  CADASTRO RECEITA")).toBe(
    "razao social cadastro receita"
  );
  expect(headerKey("SITUAÇÃO DO ACORDO DE LENIÊNICA")).toBe(
    "situacao do acordo de lenienica"
  );
});

test("parseSancoes do CEIS decodifica ISO-8859-1 e mapeia colunas", () => {
  const rows = parseSancoes("ceis", latin1(CEIS_CSV));

  expect(rows).toHaveLength(2);

  const [pj, pf] = rows;

  expect(pj.lista).toBe("ceis");
  expect(pj.codigo).toBe("100");
  expect(pj.tipoPessoa).toBe("J");
  // Documento normalizado = so digitos.
  expect(pj.docNormalizado).toBe("00000000000191");
  expect(pj.razaoSocial).toBe("CONSTRUÇÕES SÃO JOSÉ LTDA");
  // Datas BR -> ISO.
  expect(pj.dataInicio).toBe("2020-02-01");
  expect(pj.dataFinal).toBe("2025-02-01");
  // Busca normalizada (sem acento).
  expect(pj.buscaTexto).toContain("construcoes sao jose");

  expect(pf.docNormalizado).toBe("12345678900");
  expect(pf.tipoPessoa).toBe("F");
});

test("CEAF mantem CPF mascarado sem digitos completos", () => {
  const csv =
    '"CÓDIGO DA SANÇÃO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"CATEGORIA DA SANÇÃO";"CARGO EFETIVO";"ÓRGÃO SANCIONADOR";"DATA PUBLICAÇÃO";"FUNDAMENTAÇÃO LEGAL"\r\n' +
    '"900";"F";"***.648.337-**";"Maria Expulsa";"Demissão";"Analista";"Min. Saúde";"15/06/2022";"Lei 8.112"\r\n';

  const rows = parseSancoes("ceaf", latin1(csv));

  expect(rows).toHaveLength(1);
  expect(rows[0].lista).toBe("ceaf");
  // CPF mascarado -> so restam os 6 digitos visiveis.
  expect(rows[0].docNormalizado).toBe("648337");
  expect(rows[0].nome).toBe("Maria Expulsa");
  expect(rows[0].dataPublicacao).toBe("2022-06-15");
});

test("CEPIM mapeia schema enxuto de entidade", () => {
  const csv =
    '"CNPJ ENTIDADE";"NOME ENTIDADE";"NÚMERO CONVÊNIO";"ÓRGÃO CONCEDENTE";"MOTIVO DO IMPEDIMENTO"\r\n' +
    '"11.222.333/0001-44";"Associação Beneficente";"555";"Min. Cidadania";"Prestação de contas"\r\n';

  const rows = parseSancoes("cepim", latin1(csv));

  expect(rows).toHaveLength(1);
  expect(rows[0].lista).toBe("cepim");
  expect(rows[0].tipoPessoa).toBe("J");
  expect(rows[0].docNormalizado).toBe("11222333000144");
  expect(rows[0].orgaoSancionador).toBe("Min. Cidadania");
});

test("Acordos casa header com typo (LENIENICA) e CNPJ estrangeiro placeholder", () => {
  // Header com os typos reais da fonte: 'LENIENICA' e 'RAZAO SOCIAL  CADASTRO RECEITA'.
  const csv =
    '"ID DO ACORDO";"CNPJ DO SANCIONADO";"RAZÃO SOCIAL  CADASTRO RECEITA";"DATA DE INÍCIO DO ACORDO";"DATA DE FIM DO ACORDO";"SITUAÇÃO DO ACORDO DE LENIÊNICA";"NÚMERO DO PROCESSO";"ÓRGÃO SANCIONADOR"\r\n' +
    '"1000002";"15.144.306/0001-99";"ODEBRECHT SA";"01/01/2018";"01/01/2030";"Em cumprimento";"P-1";"CGU"\r\n' +
    '"1000003";"EXBILFINGER";"BILFINGER SE";"01/01/2019";"01/01/2031";"Em cumprimento";"P-2";"CGU"\r\n';

  const rows = parseSancoes("acordos-leniencia", latin1(csv));

  expect(rows).toHaveLength(2);
  expect(rows[0].lista).toBe("acordos-leniencia");
  expect(rows[0].codigo).toBe("1000002");
  expect(rows[0].docNormalizado).toBe("15144306000199");
  // Typo de header casado: situacao preenchida em categoria.
  expect(rows[0].categoria).toBe("Em cumprimento");
  expect(rows[0].razaoSocial).toBe("ODEBRECHT SA");
  // Placeholder estrangeiro EX... nao vira CNPJ de 14 digitos.
  expect(rows[1].docNormalizado).toBe("");
});

test("parseEfeitos extrai relacao 1:N por id do acordo", () => {
  const csv =
    '"ID DO ACORDO";"EFEITO DO ACORDO DE LENIÊNCIA";"COMPLEMENTO"\r\n' +
    '"1000002";"Pagamento de multa";"R$ 1.000.000"\r\n' +
    '"1000002";"Ressarcimento";"Integral"\r\n';

  const efeitos = parseEfeitos(latin1(csv));

  expect(efeitos).toHaveLength(2);
  expect(efeitos[0].idAcordo).toBe("1000002");
  expect(efeitos[0].efeito).toBe("Pagamento de multa");
  expect(efeitos[1].efeito).toBe("Ressarcimento");
});

/** Monta um banco :memory: populado a partir das fixtures de CSV. */
function buildMemoryDb(): Database {
  const db = new Database(":memory:");

  createSchema(db);

  const ceis = parseSancoes("ceis", latin1(CEIS_CSV));
  const cnepCsv =
    '"CÓDIGO DA SANÇÃO";"TIPO DE PESSOA";"CPF OU CNPJ DO SANCIONADO";"NOME DO SANCIONADO";"RAZÃO SOCIAL - CADASTRO RECEITA";"CATEGORIA DA SANÇÃO";"VALOR DA MULTA";"DATA INÍCIO SANÇÃO";"DATA FINAL SANÇÃO";"ÓRGÃO SANCIONADOR";"UF ÓRGÃO SANCIONADOR"\r\n' +
    '"200";"J";"00.000.000/0001-91";"Construções Ltda";"CONSTRUÇÕES SÃO JOSÉ LTDA";"Multa Lei Anticorrupção";"500000,00";"05/05/2019";"05/05/2024";"CGU";"DF"\r\n';
  const cnep = parseSancoes("cnep", latin1(cnepCsv));

  insertSancoes(db, [...ceis, ...cnep]);
  insertEfeitos(db, [
    {
      idAcordo: "1000002",
      docNormalizado: "15144306000199",
      efeito: "Multa",
      complemento: "x",
    },
  ]);
  rebuildFts(db);

  return db;
}

test("verificarSancoes cruza listas por CNPJ e sinaliza inidoneidade", () => {
  const db = buildMemoryDb();

  const r = verificarSancoes(db, "00.000.000/0001-91");

  expect(r.tipoDocumento).toBe("cnpj");
  expect(r.sancionado).toBe(true);
  expect(r.inidoneoOuImpedido).toBe(true);
  // Aparece em CEIS e CNEP.
  expect(r.total).toBe(2);
  expect(r.porLista.ceis).toBe(1);
  expect(r.porLista.cnep).toBe(1);
  // CNEP traz valor da multa.
  const cnep = r.sancoes.find((s) => s.lista === "cnep");
  expect(cnep?.valorMulta).toBe("500000,00");

  db.close();
});

test("verificarSancoes retorna vazio para documento limpo", () => {
  const db = buildMemoryDb();

  const r = verificarSancoes(db, "99.999.999/9999-99");

  expect(r.sancionado).toBe(false);
  expect(r.inidoneoOuImpedido).toBe(false);
  expect(r.total).toBe(0);

  db.close();
});

test("buscarSancionadoPorNome encontra por razao social via FTS (sem acento)", () => {
  const db = buildMemoryDb();

  const r = buscarSancionadoPorNome(db, "construcoes sao jose");

  expect(r.total).toBeGreaterThan(0);
  expect(
    r.sancoes.every((s) => (s.razaoSocial ?? "").includes("CONSTRU"))
  ).toBe(true);

  // Tambem casa buscando com acento na entrada do usuario.
  const comAcento = buscarSancionadoPorNome(db, "Construções");
  expect(comAcento.total).toBeGreaterThan(0);

  db.close();
});

test("sancoesVigentesNaData filtra por intervalo de vigencia", () => {
  const db = buildMemoryDb();

  // Em 2022 o CEIS PJ (2020-02-01 a 2025-02-01) e o CNEP (2019-2024) estao
  // vigentes; o CEIS PF comeca 2021-03-10 e vai ate 2099 (vigente tambem).
  const em2022 = sancoesVigentesNaData(db, "2022-06-01");
  expect(em2022.total).toBe(3);

  // Em 2026 o CEIS PJ (ate 2025) e CNEP (ate 2024) ja expiraram; so o PF (2099).
  const em2026 = sancoesVigentesNaData(db, "2026-06-01");
  expect(em2026.total).toBe(1);
  expect(em2026.sancoes[0].lista).toBe("ceis");

  // Filtro por lista.
  const soCnep = sancoesVigentesNaData(db, "2022-06-01", { lista: "cnep" });
  expect(soCnep.total).toBe(1);
  expect(soCnep.sancoes[0].lista).toBe("cnep");

  db.close();
});
