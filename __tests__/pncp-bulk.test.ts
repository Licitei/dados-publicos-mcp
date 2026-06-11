import { Database } from "bun:sqlite";
import { beforeEach, expect, test } from "bun:test";
import {
  extractPageData,
  mapAta,
  mapContratacao,
  mapContrato,
  mapPageRows,
  type AtaRow,
  type ContratacaoRow,
  type ContratoRow,
} from "../src/modules/dados-publicos/pncp-mapper";
import {
  createSchema,
  insertAtas,
  insertContratacoes,
  insertContratos,
} from "../src/modules/dados-publicos/pncp-store";
import {
  alertasPncpDb,
  buscarPncpLocalDb,
  contratosDoFornecedorDb,
  fornecedorPncpPorNomeDb,
  toFtsQuery,
} from "../src/modules/dados-publicos/pncp-service";

// ---------------------------------------------------------------------------
// Fixtures (shapes verificados; atas usa shape FLAT)
// ---------------------------------------------------------------------------

const rawContratacao = {
  numeroControlePNCP: "00000000000191-1-000001/2024",
  anoCompra: 2024,
  sequencialCompra: 1,
  objetoCompra: "Aquisicao de notebooks e computadores para a secretaria",
  modalidadeId: 6,
  modalidadeNome: "Pregao - Eletronico",
  situacaoCompraNome: "Divulgada no PNCP",
  valorTotalEstimado: 150000.5,
  valorTotalHomologado: null,
  dataPublicacaoPncp: "2024-01-02T10:00:00",
  dataAberturaProposta: "2024-01-03T09:00:00",
  dataEncerramentoProposta: "2024-01-10T18:00:00",
  dataAtualizacaoGlobal: "2024-01-05T12:00:00",
  srp: true,
  orgaoEntidade: {
    cnpj: "00000000000191",
    razaoSocial: "MINISTERIO DA FAZENDA",
    esferaId: "F",
    poderId: "E",
  },
  unidadeOrgao: {
    codigoIbge: "5300108",
    municipioNome: "Brasilia",
    ufSigla: "DF",
  },
};

const rawContrato = {
  numeroControlePNCP: "00000000000191-2-000045/2024",
  numeroControlePncpCompra: "00000000000191-1-000001/2024",
  anoContrato: 2024,
  sequencialContrato: 45,
  objetoContrato: "Fornecimento de equipamentos de informatica",
  niFornecedor: "11222333000181",
  tipoPessoa: "PJ",
  nomeRazaoSocialFornecedor: "TECNOLOGIA E SOLUCOES LTDA",
  valorInicial: 90000,
  valorGlobal: 95000,
  valorAcumulado: 95000,
  dataAssinatura: "2024-01-15",
  dataVigenciaInicio: "2024-01-15",
  dataVigenciaFim: "2024-12-31",
  dataPublicacaoPncp: "2024-01-16T08:00:00",
  dataAtualizacaoGlobal: "2024-01-16T08:00:00",
  tipoContrato: "Contrato",
  orgaoEntidade: {
    cnpj: "00000000000191",
    razaoSocial: "MINISTERIO DA FAZENDA",
  },
  unidadeOrgao: { codigoIbge: "5300108", ufSigla: "DF" },
};

// atas: shape FLAT verificado (sem orgaoEntidade/unidadeOrgao aninhados).
const rawAta = {
  numeroControlePNCPAta: "00000000000191-3-000009/2024",
  numeroControlePNCPCompra: "00000000000191-1-000001/2024",
  anoAta: 2024,
  numeroAtaRegistroPreco: "9/2024",
  objetoContratacao: "Registro de preco para material de escritorio",
  vigenciaInicio: "2024-02-01",
  vigenciaFim: "2025-01-31",
  dataAtualizacaoGlobal: "2024-02-02T09:00:00",
  cnpjOrgao: "00000000000191",
  nomeOrgao: "MINISTERIO DA FAZENDA",
  codigoUnidadeOrgao: "194035",
  ufSigla: "DF",
};

// ---------------------------------------------------------------------------
// Mapeamento PURO
// ---------------------------------------------------------------------------

test("mapContratacao achata orgaoEntidade/unidadeOrgao e normaliza srp", () => {
  const row = mapContratacao(rawContratacao) as ContratacaoRow;
  expect(row.numeroControlePNCP).toBe("00000000000191-1-000001/2024");
  expect(row.objetoCompra).toContain("notebooks");
  expect(row.orgaoCnpj).toBe("00000000000191");
  expect(row.orgaoRazaoSocial).toBe("MINISTERIO DA FAZENDA");
  expect(row.codigoIbge).toBe("5300108");
  expect(row.ufSigla).toBe("DF");
  expect(row.modalidadeId).toBe(6);
  expect(row.valorTotalEstimado).toBe(150000.5);
  expect(row.srp).toBe(1);
});

test("mapContratacao usa dataAtualizacao quando dataAtualizacaoGlobal ausente", () => {
  const row = mapContratacao({
    numeroControlePNCP: "x-1-1/2024",
    dataAtualizacao: "2024-03-01T00:00:00",
  }) as ContratacaoRow;
  expect(row.dataAtualizacaoGlobal).toBe("2024-03-01T00:00:00");
});

test("mapContratacao descarta registro sem numeroControlePNCP", () => {
  expect(mapContratacao({ objetoCompra: "sem id" })).toBeNull();
});

test("mapContrato extrai niFornecedor e nomeRazaoSocialFornecedor", () => {
  const row = mapContrato(rawContrato) as ContratoRow;
  expect(row.niFornecedor).toBe("11222333000181");
  expect(row.nomeRazaoSocialFornecedor).toBe("TECNOLOGIA E SOLUCOES LTDA");
  expect(row.numeroControlePncpCompra).toBe("00000000000191-1-000001/2024");
  expect(row.valorGlobal).toBe(95000);
  expect(row.orgaoCnpj).toBe("00000000000191");
  expect(row.ufSigla).toBe("DF");
});

test("mapAta le shape FLAT (vigenciaInicio/Fim, cnpjOrgao, objetoContratacao)", () => {
  const row = mapAta(rawAta) as AtaRow;
  expect(row.numeroControlePNCPAta).toBe("00000000000191-3-000009/2024");
  expect(row.objetoContratacao).toContain("material de escritorio");
  expect(row.vigenciaInicio).toBe("2024-02-01");
  expect(row.vigenciaFim).toBe("2025-01-31");
  expect(row.cnpjOrgao).toBe("00000000000191");
  expect(row.codigoUnidadeOrgao).toBe("194035");
  expect(row.numeroAtaRegistroPreco).toBe("9/2024");
});

test("extractPageData le data[] + totalRegistros/totalPaginas/paginasRestantes", () => {
  const page = extractPageData({
    data: [rawContratacao, { numeroControlePNCP: "y-1-2/2024" }],
    totalRegistros: 717,
    totalPaginas: 72,
    paginasRestantes: 71,
  });
  expect(page.data.length).toBe(2);
  expect(page.totalRegistros).toBe(717);
  expect(page.totalPaginas).toBe(72);
  expect(page.paginasRestantes).toBe(71);
});

test("extractPageData tolera array cru e payload vazio", () => {
  expect(extractPageData([rawContrato]).data.length).toBe(1);
  expect(extractPageData(null).data).toEqual([]);
  expect(extractPageData({}).data).toEqual([]);
});

test("mapPageRows mapeia pagina inteira e descarta sem PK", () => {
  const rows = mapPageRows("contratacoes", [
    rawContratacao,
    { objetoCompra: "sem id" },
  ]);
  expect(rows.length).toBe(1);
  expect((rows[0] as ContratacaoRow).numeroControlePNCP).toBe(
    "00000000000191-1-000001/2024",
  );
});

// ---------------------------------------------------------------------------
// FTS query sanitization
// ---------------------------------------------------------------------------

test("toFtsQuery envolve tokens em aspas e ignora vazios/aspas", () => {
  expect(toFtsQuery("notebooks dell")).toBe('"notebooks" "dell"');
  expect(toFtsQuery('  obra "ponte" ')).toBe('"obra" "ponte"');
  expect(toFtsQuery("   ")).toBe('""');
});

// ---------------------------------------------------------------------------
// Busca em SQLite + FTS5 (Database em memoria, sem rede, sem disco)
// ---------------------------------------------------------------------------

let db: Database;

function seed(database: Database) {
  createSchema(database);
  insertContratacoes(database, [
    mapContratacao(rawContratacao) as ContratacaoRow,
    mapContratacao({
      numeroControlePNCP: "00000000000272-1-000002/2024",
      objetoCompra: "Construcao de ponte sobre o rio",
      modalidadeId: 6,
      modalidadeNome: "Pregao - Eletronico",
      valorTotalEstimado: 5000000,
      dataPublicacaoPncp: "2024-01-04T10:00:00",
      dataAtualizacaoGlobal: "2024-06-10T12:00:00",
      orgaoEntidade: { cnpj: "00000000000272", razaoSocial: "DNIT" },
      unidadeOrgao: {
        codigoIbge: "3550308",
        municipioNome: "Sao Paulo",
        ufSigla: "SP",
      },
    }) as ContratacaoRow,
  ]);
  insertContratos(database, [
    mapContrato(rawContrato) as ContratoRow,
    mapContrato({
      numeroControlePNCP: "00000000000272-2-000099/2024",
      objetoContrato: "Servico de manutencao de ponte rodoviaria",
      niFornecedor: "11222333000181",
      tipoPessoa: "PJ",
      nomeRazaoSocialFornecedor: "TECNOLOGIA E SOLUCOES LTDA",
      valorGlobal: 200000,
      dataAtualizacaoGlobal: "2024-06-09T08:00:00",
      orgaoEntidade: { cnpj: "00000000000272", razaoSocial: "DNIT" },
      unidadeOrgao: { codigoIbge: "3550308", ufSigla: "SP" },
    }) as ContratoRow,
  ]);
  insertAtas(database, [mapAta(rawAta) as AtaRow]);
}

beforeEach(() => {
  db = new Database(":memory:");
  seed(db);
});

test("buscar_pncp_local: FTS no objeto em todas as entidades", () => {
  const res = buscarPncpLocalDb(db, { termo: "ponte" });
  expect(res.results.contratacoes?.length).toBe(1);
  expect(res.results.contratos?.length).toBe(1);
  expect(res.results.atas?.length).toBe(0);
  expect(res.meta.total).toBe(2);
});

test("buscar_pncp_local: filtra por UF e por entidade", () => {
  const res = buscarPncpLocalDb(db, {
    termo: "notebooks",
    entidade: "contratacoes",
    uf: "DF",
  });
  expect(res.results.contratacoes?.length).toBe(1);
  expect(res.results.contratos).toBeUndefined();

  const semUf = buscarPncpLocalDb(db, {
    termo: "notebooks",
    entidade: "contratacoes",
    uf: "SP",
  });
  expect(semUf.results.contratacoes?.length).toBe(0);
});

test("fornecedor_pncp_por_nome: FTS no nome agrega contratos e valor", () => {
  const res = fornecedorPncpPorNomeDb(db, { nome: "tecnologia solucoes" });
  expect(res.results.length).toBe(1);
  const f = res.results[0] as {
    niFornecedor: string;
    contratos: number;
    valorTotal: number;
  };
  expect(f.niFornecedor).toBe("11222333000181");
  expect(f.contratos).toBe(2);
  expect(f.valorTotal).toBe(95000 + 200000);
});

test("contratos_do_fornecedor: lista por niFornecedor e agrega por orgao", () => {
  const res = contratosDoFornecedorDb(db, {
    ni: "11.222.333/0001-81",
    agruparPor: "orgao",
  });
  expect(res.meta.totalContratos).toBe(2);
  expect(res.meta.valorTotal).toBe(95000 + 200000);
  expect(res.results.length).toBe(2);
  expect(res.agregacao.length).toBe(2);
  const orgaos = (res.agregacao as { chave: string }[]).map((a) => a.chave);
  expect(orgaos).toContain("00000000000191");
  expect(orgaos).toContain("00000000000272");
});

test("contratos_do_fornecedor: agrega por uf", () => {
  const res = contratosDoFornecedorDb(db, {
    ni: "11222333000181",
    agruparPor: "uf",
  });
  const ufs = (res.agregacao as { chave: string; valorTotal: number }[]).map(
    (a) => a.chave,
  );
  expect(ufs).toContain("DF");
  expect(ufs).toContain("SP");
});

test("alertas_pncp: editais por palavra-chave atualizados desde uma data", () => {
  const res = alertasPncpDb(db, {
    termo: "ponte",
    desde: "2024-02-01T00:00:00",
  });
  expect(res.results.length).toBe(1);
  const row = res.results[0] as { numeroControlePNCP: string };
  expect(row.numeroControlePNCP).toBe("00000000000272-1-000002/2024");

  // A contratacao de notebooks (atualizada em 2024-01-05) nao bate "ponte"
  // e tambem ficaria fora pela data; sem 'desde' retorna so o match de texto.
  const semDesde = alertasPncpDb(db, { termo: "ponte" });
  expect(semDesde.results.length).toBe(1);
});

test("alertas_pncp: filtra por UF", () => {
  const res = alertasPncpDb(db, { termo: "ponte", uf: "DF" });
  expect(res.results.length).toBe(0);
  const sp = alertasPncpDb(db, { termo: "ponte", uf: "SP" });
  expect(sp.results.length).toBe(1);
});

test("upsert: reinserir mesma PK atualiza e nao duplica no FTS", () => {
  insertContratacoes(db, [
    mapContratacao({
      ...rawContratacao,
      objetoCompra: "Aquisicao de impressoras laser",
    }) as ContratacaoRow,
  ]);
  const antigo = buscarPncpLocalDb(db, {
    termo: "notebooks",
    entidade: "contratacoes",
  });
  expect(antigo.results.contratacoes?.length).toBe(0);
  const novo = buscarPncpLocalDb(db, {
    termo: "impressoras",
    entidade: "contratacoes",
  });
  expect(novo.results.contratacoes?.length).toBe(1);
});
