import { Database } from "bun:sqlite";
import { describe, expect, test } from "bun:test";
import {
  classifyPrestacao,
  isBrasilCsv,
  zipUrl,
  ckanPackageId,
} from "../src/modules/tse-eleitoral/catalog";
import {
  loadCandidatos,
  loadBens,
  loadPrestacaoContas,
  parseTseCsv,
  resolveEscopo,
  type ZipBytes,
} from "../src/modules/tse-eleitoral/indexer";
import {
  applySchema,
  mapCandidato,
  mapDespesaContratada,
  mapReceita,
  mapReceitaOriginario,
  rebuildFts,
} from "../src/modules/tse-eleitoral/store";
import {
  buscarDoacoes,
  buscarFornecedorCampanha,
  dueDiligenceCandidato,
  rastrearDoadorOriginario,
} from "../src/modules/tse-eleitoral/service";

// ---------------------------------------------------------------------------
// Helpers de fixture: codifica texto em Latin-1 (ISO-8859-1) byte a byte para
// simular o encoding REAL dos CSVs do TSE (NAO utf-8).
// ---------------------------------------------------------------------------

function latin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);

  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }

  return out;
}

/** Constroi um ZipBytes falso a partir de mapas nome -> texto Latin-1. */
function fakeZip(files: Record<string, string>): ZipBytes {
  return {
    entries: Object.entries(files).map(([name, text]) => ({
      name,
      bytes: () => latin1(text),
    })),
  };
}

// ---------------------------------------------------------------------------
// Fixtures CSV (header na 1a linha, separador ';', decimais com virgula,
// acentos Latin-1 como ELEICAO/UNIAO/CONSTRUCAO).
// ---------------------------------------------------------------------------

const CAND_CSV =
  "ANO_ELEICAO;SG_UF;SQ_CANDIDATO;NR_CPF_CANDIDATO;NM_CANDIDATO;NM_URNA_CANDIDATO;CD_CARGO;DS_CARGO;NR_PARTIDO;SG_PARTIDO;DS_SIT_TOT_TURNO;DT_NASCIMENTO;DS_OCUPACAO\n" +
  '2024;SP;900000111;111.222.333-44;"JOSE DA CONCEICAO";"ZE";11;PREFEITO;15;MDB;ELEITO;15/03/1970;EMPRESARIO\n' +
  '2024;SP;900000222;555.666.777-88;"MARIA APARECIDA";"MARIA";13;VEREADOR;13;PT;"NAO ELEITO";20/07/1985;PROFESSORA\n';

const BEM_CSV =
  "ANO_ELEICAO;SG_UF;SQ_CANDIDATO;NR_ORDEM_BEM_CANDIDATO;CD_TIPO_BEM_CANDIDATO;DS_TIPO_BEM_CANDIDATO;DS_BEM_CANDIDATO;VR_BEM_CANDIDATO\n" +
  '2024;SP;900000111;1;12;"CASA";"Apartamento";"450.000,00"\n' +
  '2024;SP;900000111;2;21;"VEICULO";"Carro";"85.500,50"\n';

const RECEITA_CSV =
  "ANO_ELEICAO;SQ_RECEITA;SQ_CANDIDATO;NR_CPF_CANDIDATO;NR_CPF_CNPJ_DOADOR;NM_DOADOR;NM_DOADOR_RFB;CD_CNAE_DOADOR;DS_CNAE_DOADOR;SG_UF_DOADOR;VR_RECEITA;DT_RECEITA;DS_ORIGEM_RECEITA;DS_NATUREZA_RECEITA;NR_RECIBO_DOACAO\n" +
  '2024;R1;900000111;111.222.333-44;12.345.678/0001-99;"CONSTRUTORA UNIAO LTDA";"CONSTRUTORA UNIAO LTDA";"4120-4/00";"CONSTRUCAO DE EDIFICIOS";SP;"5.000,00";10/09/2024;"Recursos de pessoas juridicas";"Doacao";REC123\n' +
  '2024;R2;900000222;555.666.777-88;99.888.777/0001-11;"COMERCIO XPTO ME";"COMERCIO XPTO ME";"4711-3/01";"COMERCIO";SP;"1.234,56";12/09/2024;"Recursos de pessoas juridicas";"Doacao";REC456\n';

const ORIG_CSV =
  "ANO_ELEICAO;SQ_RECEITA;NR_CPF_CNPJ_DOADOR_ORIGINARIO;NM_DOADOR_ORIGINARIO;NM_DOADOR_ORIGINARIO_RFB;TP_DOADOR_ORIGINARIO;CD_CNAE_DOADOR_ORIGINARIO;VR_RECEITA;DT_RECEITA\n" +
  '2024;R1;12.345.678/0001-99;"CONSTRUTORA UNIAO LTDA";"CONSTRUTORA UNIAO LTDA";"Pessoa Juridica";"4120-4/00";"5.000,00";10/09/2024\n';

const DESPESA_CSV =
  "ANO_ELEICAO;SQ_DESPESA;SQ_CANDIDATO;NR_CPF_CANDIDATO;NR_CPF_CNPJ_FORNECEDOR;NM_FORNECEDOR;NM_FORNECEDOR_RFB;CD_CNAE_FORNECEDOR;DS_CNAE_FORNECEDOR;SG_UF_FORNECEDOR;VR_DESPESA_CONTRATADA;DT_DESPESA;DS_DESPESA;NR_DOCUMENTO\n" +
  '2024;D1;900000111;111.222.333-44;22.333.444/0001-55;"GRAFICA SAO JORGE";"GRAFICA SAO JORGE LTDA";"1813-0/01";"IMPRESSAO";SP;"3.200,00";01/09/2024;"Material grafico";NF001\n';

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

describe("catalog", () => {
  test("monta URLs CDN no padrao verificado", () => {
    expect(zipUrl("consulta_cand", 2024)).toBe(
      "https://cdn.tse.jus.br/estatistica/sead/odsele/consulta_cand/consulta_cand_2024.zip",
    );
    expect(zipUrl("bem_candidato", 2022)).toBe(
      "https://cdn.tse.jus.br/estatistica/sead/odsele/bem_candidato/bem_candidato_2022.zip",
    );
    expect(zipUrl("prestacao_contas", 2024)).toBe(
      "https://cdn.tse.jus.br/estatistica/sead/odsele/prestacao_contas/prestacao_de_contas_eleitorais_candidatos_2024.zip",
    );
  });

  test("ckanPackageId resolve ids de descoberta", () => {
    expect(ckanPackageId("consulta_cand", 2024)).toBe("candidatos-2024");
    expect(ckanPackageId("prestacao_contas", 2022)).toBe(
      "prestacao-de-contas-eleitorais-2022",
    );
  });

  test("isBrasilCsv distingue agregado nacional de arquivos por UF", () => {
    expect(isBrasilCsv("consulta_cand_2024_BRASIL.csv")).toBe(true);
    expect(isBrasilCsv("consulta_cand_2024_SP.csv")).toBe(false);
    expect(isBrasilCsv("leiame.pdf")).toBe(false);
  });

  test("classifyPrestacao classifica so os *_BRASIL.csv corretos", () => {
    expect(classifyPrestacao("receitas_candidatos_2024_BRASIL.csv")).toBe(
      "receitas",
    );
    expect(
      classifyPrestacao(
        "receitas_candidatos_doador_originario_2024_BRASIL.csv",
      ),
    ).toBe("receitas_doador_originario");
    expect(
      classifyPrestacao("despesas_contratadas_candidatos_2024_BRASIL.csv"),
    ).toBe("despesas_contratadas");
    // despesas_pagas nao tem CPF/CNPJ de fornecedor -> ignorada
    expect(
      classifyPrestacao("despesas_pagas_candidatos_2024_BRASIL.csv"),
    ).toBeNull();
    // arquivos por UF nao sao indexados (evita duplicar)
    expect(classifyPrestacao("receitas_candidatos_2024_SP.csv")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Parsing Latin-1 + numero/data BR
// ---------------------------------------------------------------------------

describe("parseTseCsv (Latin-1, ';', decimais virgula)", () => {
  test("decodifica acentos Latin-1 e respeita header/separador", () => {
    const rows = parseTseCsv(latin1(RECEITA_CSV));

    expect(rows).toHaveLength(2);
    expect(rows[0].NM_DOADOR).toBe("CONSTRUTORA UNIAO LTDA");
    expect(rows[0].VR_RECEITA).toBe("5.000,00");
    expect(rows[0].DS_CNAE_DOADOR).toBe("CONSTRUCAO DE EDIFICIOS");
  });

  test("decodifica caractere acentuado Latin-1 (0xC7 = C cedilha)", () => {
    // "ELEI\xC7\xC3O" em Latin-1 -> "ELEICAO" com cedilha e til
    const bytes = latin1("COL\nELEIÇÃO\n");
    const rows = parseTseCsv(bytes);

    expect(rows[0].COL).toBe("ELEIÇÃO");
  });
});

describe("mapeamento PURO de linhas", () => {
  test("mapCandidato extrai digitos do CPF e parseia data/ano", () => {
    const rows = parseTseCsv(latin1(CAND_CSV)).map(mapCandidato);

    expect(rows[0].sq_candidato).toBe("900000111");
    expect(rows[0].cpf).toBe("11122233344");
    expect(rows[0].nome).toBe("JOSE DA CONCEICAO");
    expect(rows[0].ano_eleicao).toBe(2024);
    expect(rows[0].dt_nascimento).toBe("1970-03-15");
    expect(rows[0].ds_sit_tot_turno).toBe("ELEITO");
  });

  test("mapReceita normaliza CNPJ e valor BR", () => {
    const rows = parseTseCsv(latin1(RECEITA_CSV)).map(mapReceita);

    expect(rows[0].cpf_cnpj_doador).toBe("12345678000199");
    expect(rows[0].vr_receita).toBe(5000);
    expect(rows[1].vr_receita).toBeCloseTo(1234.56, 2);
    expect(rows[0].dt_receita).toBe("2024-09-10");
  });

  test("mapDespesaContratada normaliza CNPJ do fornecedor", () => {
    const rows = parseTseCsv(latin1(DESPESA_CSV)).map(mapDespesaContratada);

    expect(rows[0].cpf_cnpj_forn).toBe("22333444000155");
    expect(rows[0].nome_forn).toBe("GRAFICA SAO JORGE");
    expect(rows[0].vr_despesa).toBe(3200);
  });

  test("mapReceitaOriginario captura cadeia por SQ_RECEITA", () => {
    const rows = parseTseCsv(latin1(ORIG_CSV)).map(mapReceitaOriginario);

    expect(rows[0].sq_receita).toBe("R1");
    expect(rows[0].cpf_cnpj_orig).toBe("12345678000199");
    expect(rows[0].vr_receita).toBe(5000);
  });

  test("sentinela #NULO# vira string vazia", () => {
    const csv =
      "ANO_ELEICAO;SQ_CANDIDATO;NR_CPF_CANDIDATO;NM_CANDIDATO\n" +
      "2024;900000333;#NULO#;FULANO\n";
    const row = parseTseCsv(latin1(csv)).map(mapCandidato)[0];

    expect(row.cpf).toBe("");
  });
});

// ---------------------------------------------------------------------------
// Escopo
// ---------------------------------------------------------------------------

describe("resolveEscopo", () => {
  test("default (DEFAULT-2026) usa SOMENTE o ano corrente e todos os tipos", () => {
    const e = resolveEscopo(undefined);
    const anoCorrente = new Date().getFullYear();

    // Sem flags de escopo, o build indexa apenas o ano corrente (dinamico).
    expect(e.anos).toEqual([anoCorrente]);
    expect(e.tipos).toContain("consulta_cand");
    expect(e.tipos).toContain("prestacao_contas");
  });

  test("aceita anos como array, numero ou string", () => {
    expect(resolveEscopo({ anos: [2024] }).anos).toEqual([2024]);
    expect(resolveEscopo({ anos: 2020 }).anos).toEqual([2020]);
    expect(resolveEscopo({ anos: "2024, 2018" }).anos).toEqual([2024, 2018]);
  });

  test("filtra tipos invalidos e cai no default quando vazio", () => {
    expect(resolveEscopo({ tipos: ["consulta_cand", "xxx"] }).tipos).toEqual([
      "consulta_cand",
    ]);
    expect(resolveEscopo({ tipos: [] }).tipos.length).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Loaders + busca contra DB :memory: (sem rede, sem disco)
// ---------------------------------------------------------------------------

function buildMemoryDb(): Database {
  const db = new Database(":memory:");

  applySchema(db);

  const candZip = fakeZip({
    "consulta_cand_2024_BRASIL.csv": CAND_CSV,
    "consulta_cand_2024_SP.csv": CAND_CSV, // por UF: deve ser IGNORADO
    "leiame.pdf": "ignore",
  });
  const bemZip = fakeZip({ "bem_candidato_2024_BRASIL.csv": BEM_CSV });
  const prestacaoZip = fakeZip({
    "receitas_candidatos_2024_BRASIL.csv": RECEITA_CSV,
    "receitas_candidatos_doador_originario_2024_BRASIL.csv": ORIG_CSV,
    "despesas_contratadas_candidatos_2024_BRASIL.csv": DESPESA_CSV,
    "despesas_pagas_candidatos_2024_BRASIL.csv":
      "ANO_ELEICAO;SQ_DESPESA;VR_PAGTO_DESPESA\n2024;D1;100,00\n", // ignorado
    "receitas_candidatos_2024_SP.csv": RECEITA_CSV, // por UF: ignorado
  });

  const nCand = loadCandidatos(db, candZip);
  const nBem = loadBens(db, bemZip);
  const nPrest = loadPrestacaoContas(db, prestacaoZip);

  // dedup BRASIL vs UF: so 2 candidatos (nao 4)
  expect(nCand).toBe(2);
  expect(nBem).toBe(2);
  // receitas(2) + originario(1) + despesas(1) = 4, despesas_pagas e UF ignorados
  expect(nPrest).toBe(4);

  rebuildFts(db);

  return db;
}

describe("loaders + tools de busca", () => {
  test("indexa somente BRASIL.csv (nao duplica UF) e ignora despesas_pagas", () => {
    const db = buildMemoryDb();

    expect(
      (db.query("SELECT COUNT(*) c FROM candidatos").get() as { c: number }).c,
    ).toBe(2);
    expect(
      (db.query("SELECT COUNT(*) c FROM receitas").get() as { c: number }).c,
    ).toBe(2);
    db.close();
  });

  test("buscar_doacoes por CNPJ liga doador a candidato", () => {
    const db = buildMemoryDb();
    const rows = buscarDoacoes(db, { termo: "12.345.678/0001-99" }) as {
      cpf_cnpj_doador: string;
      nome_candidato: string;
      vr_receita: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].cpf_cnpj_doador).toBe("12345678000199");
    expect(rows[0].nome_candidato).toBe("JOSE DA CONCEICAO");
    expect(rows[0].vr_receita).toBe(5000);
    db.close();
  });

  test("buscar_doacoes por nome usa FTS5", () => {
    const db = buildMemoryDb();
    const rows = buscarDoacoes(db, { termo: "construtora" }) as {
      nome_doador: string;
    }[];

    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].nome_doador).toContain("CONSTRUTORA");
    db.close();
  });

  test("buscar_fornecedor_campanha por nome (FTS) liga fornecedor a campanha", () => {
    const db = buildMemoryDb();
    const rows = buscarFornecedorCampanha(db, { termo: "grafica" }) as {
      cpf_cnpj_forn: string;
      nome_candidato: string;
      vr_despesa: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].cpf_cnpj_forn).toBe("22333444000155");
    expect(rows[0].nome_candidato).toBe("JOSE DA CONCEICAO");
    db.close();
  });

  test("rastrear_doador_originario segue a cadeia por SQ_RECEITA", () => {
    const db = buildMemoryDb();
    const rows = rastrearDoadorOriginario(db, {
      cpfCnpj: "12345678000199",
    }) as {
      sq_receita: string;
      nome_candidato: string;
      vr_originario: number;
    }[];

    expect(rows).toHaveLength(1);
    expect(rows[0].sq_receita).toBe("R1");
    expect(rows[0].nome_candidato).toBe("JOSE DA CONCEICAO");
    expect(rows[0].vr_originario).toBe(5000);
    db.close();
  });

  test("due_diligence_candidato por CPF cruza candidatura + bens", () => {
    const db = buildMemoryDb();
    const out = dueDiligenceCandidato(db, { cpf: "111.222.333-44" });

    expect(out.candidaturas).toHaveLength(1);
    expect((out.candidaturas[0] as { nome: string }).nome).toBe(
      "JOSE DA CONCEICAO",
    );
    expect(out.bens).toHaveLength(2);
    expect(out.totalBensDeclarado).toBeCloseTo(535500.5, 2);
    db.close();
  });

  test("due_diligence_candidato por SQ_CANDIDATO", () => {
    const db = buildMemoryDb();
    const out = dueDiligenceCandidato(db, { sqCandidato: "900000222" });

    expect(out.candidaturas).toHaveLength(1);
    expect(out.bens).toHaveLength(0);
    db.close();
  });
});
