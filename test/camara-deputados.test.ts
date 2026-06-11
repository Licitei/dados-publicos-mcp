import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { Result } from "better-result";
import {
  idFromUri,
  mapDespesa,
  parseDeputados,
  parseDespesas,
  parseProposicoes,
  parseProposicoesAutores,
} from "../src/modules/camara-deputados/mapping";
import {
  initDb,
  inserirDeputados,
  inserirDespesas,
  inserirProposicoes,
  inserirProposicoesAutores,
} from "../src/modules/camara-deputados/store";
import {
  buscarDeputadoDb,
  buscarProposicaoDb,
  fornecedorCotaParlamentarDb,
  gastosPorFornecedorDb,
  statusDb,
} from "../src/modules/camara-deputados/service";
import { resolverEscopo } from "../src/modules/camara-deputados/indexer";
import { camaraErrors } from "../src/modules/camara-deputados/errors";

/* ------------------------- fixtures CSV inline (BOM + ';') ---------------- */

const BOM = "﻿";

const deputadosCsv =
  BOM +
  [
    "uri;nome;nomeCivil;cpf;siglaSexo;dataNascimento;dataFalecimento;ufNascimento;municipioNascimento;idLegislaturaInicial;idLegislaturaFinal",
    "https://dadosabertos.camara.leg.br/api/v2/deputados/220593;Fulano de Tal;FULANO DE TAL SILVA;;M;15/03/1975;;SP;Sao Paulo;55;57",
    'https://dadosabertos.camara.leg.br/api/v2/deputados/178832;"Ciclana, Maria";MARIA CICLANA SOUZA;;F;1980-07-22;;RJ;Niteroi;56;57',
  ].join("\n");

// Coluna txtCNPJCPF com pontuacao inconsistente (como no arquivo real).
const ceapCsv =
  BOM +
  [
    "nuDeputadoId;ideCadastro;txNomeParlamentar;cpf;sgUF;sgPartido;numSubCota;txtDescricao;txtFornecedor;txtCNPJCPF;datEmissao;vlrDocumento;vlrGlosa;vlrLiquido;numMes;numAno;ideDocumento;urlDocumento",
    "220593;1234;FULANO;;SP;XPTO;3;COMBUSTIVEIS;POSTO BOA VIAGEM LTDA;12.345.678/0001-95;2024-02-10;500,00;0,00;500,00;2;2024;7777;http://doc/1",
    "220593;1234;FULANO;;SP;XPTO;1;PASSAGENS;POSTO BOA VIAGEM LTDA;12345678000195;2024-03-05;1.250,50;0,00;1.250,50;3;2024;7778;http://doc/2",
    "178832;5678;MARIA;;RJ;YPTO;3;COMBUSTIVEIS;POSTO BOA VIAGEM LTDA;12.345.678/0001-95;2024-04-01;300,00;50,00;250,00;4;2024;7779;http://doc/3",
    "178832;5678;MARIA;;RJ;YPTO;13;TELEFONIA;TELE BRASIL SA;98.765.432/0001-00;2023-12-20;100,00;0,00;100,00;12;2023;7780;http://doc/4",
  ].join("\n");

const proposicoesCsv =
  BOM +
  [
    "id;uri;siglaTipo;numero;ano;ementa;ementaDetalhada;keywords;dataApresentacao;ultimoStatus_descricaoSituacao;ultimoStatus_dataHora;ultimoStatus_siglaOrgao",
    "2355879;https://x/2355879;PL;1234;2024;Dispoe sobre licitacoes e contratos administrativos;Detalha regras de licitacao;licitacao, contrato, pregao;2024-03-01;Tramitando;2024-04-01T10:00;PLEN",
    "2355880;https://x/2355880;PEC;5;2024;Altera o regime de previdencia;Reforma previdenciaria;previdencia, aposentadoria;2024-02-15;Arquivada;2024-05-01T12:00;CCJ",
  ].join("\n");

const autoresCsv =
  BOM +
  [
    "idProposicao;uriAutor;idDeputadoAutor;nomeAutor;proponente",
    "2355879;https://dadosabertos.camara.leg.br/api/v2/deputados/220593;220593;Fulano de Tal;1",
    "2355880;https://dadosabertos.camara.leg.br/api/v2/deputados/178832;178832;Maria Ciclana;1",
  ].join("\n");

/* --------------------------------- mapping -------------------------------- */

test("idFromUri extrai o id numerico do final da uri", () => {
  expect(idFromUri("https://dadosabertos.camara.leg.br/api/v2/deputados/220593")).toBe(220593);
  expect(idFromUri("")).toBeNull();
  expect(idFromUri(null)).toBeNull();
});

test("parseDeputados decodifica BOM, ';', aspas e extrai id da uri", () => {
  const rows = parseDeputados(deputadosCsv);

  expect(rows.length).toBe(2);
  expect(rows[0].id).toBe(220593);
  expect(rows[0].nome).toBe("Fulano de Tal");
  expect(rows[0].dataNascimento).toBe("1975-03-15");
  // Campo entre aspas com virgula interna deve ficar intacto.
  expect(rows[1].nome).toBe("Ciclana, Maria");
  expect(rows[1].id).toBe(178832);
  // nome_norm cobre busca sem acento.
  expect(rows[0].nomeNorm).toContain("fulano de tal");
});

test("mapDespesa normaliza txtCNPJCPF removendo pontuacao e parseia valores BR", () => {
  const row = mapDespesa({
    nuDeputadoId: "220593",
    txtCNPJCPF: "085.324.290/0013-1",
    vlrLiquido: "1.250,50",
    numAno: "2024",
    txtFornecedor: "FORN X",
  });

  expect(row.cnpjCpfNorm).toBe("08532429000131");
  expect(row.vlrLiquido).toBe(1250.5);
  expect(row.numAno).toBe(2024);
  expect(row.nuDeputadoId).toBe(220593);
});

test("parseDespesas mapeia todas as linhas CEAP", () => {
  const rows = parseDespesas(ceapCsv);

  expect(rows.length).toBe(4);
  // Duas grafias diferentes do mesmo CNPJ devem normalizar igual.
  expect(rows[0].cnpjCpfNorm).toBe("12345678000195");
  expect(rows[1].cnpjCpfNorm).toBe("12345678000195");
});

test("parseProposicoes mapeia ementa/keywords e flatten de ultimoStatus", () => {
  const rows = parseProposicoes(proposicoesCsv);

  expect(rows.length).toBe(2);
  expect(rows[0].id).toBe(2355879);
  expect(rows[0].siglaTipo).toBe("PL");
  expect(rows[0].situacao).toBe("Tramitando");
  expect(rows[0].keywords).toContain("licitacao");
});

/* ------------------------- escopo do indexer (puro) ----------------------- */

test("resolverEscopo aceita lista de anos, intervalo e flags", () => {
  expect(resolverEscopo({ anos: [2023, 2024] }).anos).toEqual([2023, 2024]);
  expect(resolverEscopo({ anoInicial: 2022, anoFinal: 2024 }).anos).toEqual([
    2022, 2023, 2024,
  ]);
  // Anos fora do intervalo CEAP sao descartados.
  expect(resolverEscopo({ anos: [1999, 2024] }).anos).toEqual([2024]);
  expect(resolverEscopo({ incluirProposicoes: true }).incluirProposicoes).toBe(true);
  // Sem escopo cai no default (apenas 1 ano).
  expect(resolverEscopo(undefined).anos.length).toBe(1);
});

/* ----------------------- busca sobre db :memory: -------------------------- */

function dbPopulado(): Database {
  const db = new Database(":memory:");

  initDb(db);
  inserirDeputados(db, parseDeputados(deputadosCsv));
  inserirDespesas(db, parseDespesas(ceapCsv));
  inserirProposicoes(db, parseProposicoes(proposicoesCsv));
  inserirProposicoesAutores(db, parseProposicoesAutores(autoresCsv));

  return db;
}

test("statusDb conta as linhas de cada tabela", () => {
  const db = dbPopulado();

  expect(statusDb(db)).toEqual({
    deputados: 2,
    despesas: 4,
    proposicoes: 2,
    proposicoesAutores: 2,
  });

  db.close();
});

test("fornecedor_cota_parlamentar: reverse-lookup por CNPJ soma por deputado", () => {
  const db = dbPopulado();
  // CNPJ informado com pontuacao deve casar com o normalizado.
  const res = fornecedorCotaParlamentarDb(db, {
    cnpjCpf: "12.345.678/0001-95",
  });

  expect(res.cnpjCpf).toBe("12345678000195");
  expect(res.totalDocumentos).toBe(3);
  // 500 + 1250.50 (Fulano) + 250 (Maria) = 2000.50
  expect(res.totalLiquido).toBeCloseTo(2000.5, 2);
  expect(res.deputados.length).toBe(2);
  // Ordenado por totalLiquido desc: Fulano (1750.50) antes de Maria (250).
  expect(res.deputados[0].deputadoId).toBe(220593);
  expect(res.deputados[0].totalLiquido).toBeCloseTo(1750.5, 2);

  db.close();
});

test("fornecedor_cota_parlamentar: filtro por ano restringe os documentos", () => {
  const db = dbPopulado();
  const res = fornecedorCotaParlamentarDb(db, {
    cnpjCpf: "98765432000100",
    ano: 2024,
  });

  expect(res.totalDocumentos).toBe(0);

  const res2023 = fornecedorCotaParlamentarDb(db, {
    cnpjCpf: "98765432000100",
    ano: 2023,
  });

  expect(res2023.totalDocumentos).toBe(1);

  db.close();
});

test("gastos_por_fornecedor: agrega por fornecedor via FTS no nome", () => {
  const db = dbPopulado();
  const res = gastosPorFornecedorDb(db, { fornecedor: "POSTO BOA VIAGEM" });

  expect(res.fornecedores.length).toBe(1);
  expect(res.fornecedores[0].cnpjCpf).toBe("12345678000195");
  expect(res.fornecedores[0].documentos).toBe(3);
  expect(res.fornecedores[0].totalLiquido).toBeCloseTo(2000.5, 2);

  db.close();
});

test("gastos_por_fornecedor: filtro por categoria (txtDescricao)", () => {
  const db = dbPopulado();
  const res = gastosPorFornecedorDb(db, { categoria: "COMBUSTIVEIS" });

  // Apenas as duas linhas de COMBUSTIVEIS (ambas do mesmo CNPJ) agregam.
  expect(res.fornecedores.length).toBe(1);
  expect(res.fornecedores[0].documentos).toBe(2);
  expect(res.fornecedores[0].totalLiquido).toBeCloseTo(750, 2);

  db.close();
});

test("buscar_deputado: por nome normalizado (sem acento) e por id", () => {
  const db = dbPopulado();

  const porNome = buscarDeputadoDb(db, { nome: "ciclana" });
  expect(porNome.deputados.length).toBe(1);
  expect(porNome.deputados[0].id).toBe(178832);

  const porId = buscarDeputadoDb(db, { id: 220593 });
  expect(porId.deputados.length).toBe(1);
  expect(porId.deputados[0].nome).toBe("Fulano de Tal");

  db.close();
});

test("buscar_proposicao: FTS em ementa/keywords e inclusao de autores", () => {
  const db = dbPopulado();

  const res = buscarProposicaoDb(db, {
    termo: "licitacao",
    incluirAutores: true,
  });

  expect(res.proposicoes.length).toBe(1);
  expect(res.proposicoes[0].id).toBe(2355879);
  expect((res.proposicoes[0].autores as unknown[]).length).toBe(1);

  const previdencia = buscarProposicaoDb(db, { termo: "previdencia" });
  expect(previdencia.proposicoes.length).toBe(1);
  expect(previdencia.proposicoes[0].siglaTipo).toBe("PEC");

  // Filtro por tipo restringe.
  const semPL = buscarProposicaoDb(db, { termo: "previdencia", tipo: "PL" });
  expect(semPL.proposicoes.length).toBe(0);

  db.close();
});

test("Result.serialize embrulha o EvlogError do servico quando o db nao existe", () => {
  // O canal de erro agora e o catalogo evlog declarativo: o code segue o
  // padrao "<prefixo>.CODE" e o EvlogError e serializavel pelas tools.
  const erro = camaraErrors.INDICE_AUSENTE({ caminho: "/tmp/inexistente.db" });

  expect(erro.code).toBe("camara-deputados.INDICE_AUSENTE");

  const serialized = Result.serialize(Result.err(erro));

  expect(serialized.status).toBe("error");
});
