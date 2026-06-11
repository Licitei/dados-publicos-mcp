import { Database } from "bun:sqlite";
import { Result } from "better-result";
import { beforeEach, describe, expect, test } from "bun:test";
import {
  buildPageUrl,
  TAMANHO_PAGINA_MAX,
} from "../src/modules/sicaf-fornecedores/catalog";
import {
  createSchema,
  insertFornecedores,
  mapFornecedor,
  normalizeCnpjLoose,
  totalFornecedores,
  type FornecedorRaw,
} from "../src/modules/sicaf-fornecedores/store";
import {
  buildFtsQuery,
  buscarFornecedor,
  fornecedorHabilitado,
  listarFornecedoresUfCnae,
} from "../src/modules/sicaf-fornecedores/service";

// ---------------------------------------------------------------------------
// Fixtures inline (sem rede): trecho de `resultado[]` da API real.
// PJ vem com cnpj completo; PF vem com cpf MASCARADO e cnpj null.
// ---------------------------------------------------------------------------
const RAW_FIXTURES: FornecedorRaw[] = [
  {
    cnpj: "00000000000191",
    cpf: null,
    nomeRazaoSocialFornecedor: "CONSTRUTORA SAO JOAO LTDA",
    ativo: true,
    habilitadoLicitar: true,
    ufSigla: "sp",
    nomeMunicipio: "Sao Paulo",
    codigoCnae: 4120400,
    nomeCnae: "Construcao de edificios",
    naturezaJuridicaId: 2062,
    naturezaJuridicaNome: "Sociedade Empresaria Limitada",
    porteEmpresaId: 3,
    porteEmpresaNome: "Demais",
  },
  {
    cnpj: "11222333000181",
    cpf: null,
    nomeRazaoSocialFornecedor: "TECNOLOGIA E SOFTWARE BRASIL S.A.",
    ativo: true,
    habilitadoLicitar: false,
    ufSigla: "RJ",
    nomeMunicipio: "Rio de Janeiro",
    codigoCnae: 6201500,
    nomeCnae: "Desenvolvimento de programas de computador sob encomenda",
    naturezaJuridicaId: 2054,
    naturezaJuridicaNome: "Sociedade Anonima Fechada",
    porteEmpresaId: 1,
    porteEmpresaNome: "ME",
  },
  {
    cnpj: null,
    cpf: "***007562**",
    nomeRazaoSocialFornecedor: "MARIA SILVA SANTOS",
    ativo: false,
    habilitadoLicitar: false,
    ufSigla: "SP",
    nomeMunicipio: "Campinas",
    codigoCnae: null,
    nomeCnae: null,
    naturezaJuridicaId: null,
    naturezaJuridicaNome: null,
    porteEmpresaId: null,
    porteEmpresaNome: null,
  },
];

function populatedDb(): Database {
  const db = new Database(":memory:");

  createSchema(db);
  insertFornecedores(db, RAW_FIXTURES.map(mapFornecedor));

  return db;
}

describe("catalog / buildPageUrl", () => {
  test("monta URL com ativo obrigatorio e tamanhoPagina default", () => {
    const url = buildPageUrl({ pagina: 1, ativo: true });

    expect(url).toContain("pagina=1");
    expect(url).toContain(`tamanhoPagina=${TAMANHO_PAGINA_MAX}`);
    expect(url).toContain("ativo=true");
  });

  test("clampa tamanhoPagina acima de 500 para 500", () => {
    const url = buildPageUrl({ pagina: 2, ativo: false, tamanhoPagina: 999 });

    expect(url).toContain("tamanhoPagina=500");
    expect(url).toContain("ativo=false");
  });

  test("clampa tamanhoPagina abaixo de 10 para 10", () => {
    const url = buildPageUrl({ pagina: 1, ativo: true, tamanhoPagina: 1 });

    expect(url).toContain("tamanhoPagina=10");
  });
});

describe("normalizeCnpjLoose", () => {
  test("mantem 14 digitos", () => {
    expect(normalizeCnpjLoose("00.000.000/0001-91")).toBe("00000000000191");
  });

  test("retorna null para PF sem CNPJ (em vez de lancar)", () => {
    expect(normalizeCnpjLoose(null)).toBeNull();
    expect(normalizeCnpjLoose("")).toBeNull();
    expect(normalizeCnpjLoose("123")).toBeNull();
  });
});

describe("mapFornecedor", () => {
  test("normaliza UF para maiusculo e tipa campos", () => {
    const mapped = mapFornecedor(RAW_FIXTURES[0]!);

    expect(mapped.cnpj).toBe("00000000000191");
    expect(mapped.ufSigla).toBe("SP");
    expect(mapped.ativo).toBe(true);
    expect(mapped.habilitadoLicitar).toBe(true);
    expect(mapped.codigoCnae).toBe(4120400);
    expect(mapped.cpf).toBeNull();
  });

  test("preserva CPF mascarado de PF e deixa cnpj null", () => {
    const mapped = mapFornecedor(RAW_FIXTURES[2]!);

    expect(mapped.cnpj).toBeNull();
    expect(mapped.cpf).toBe("***007562**");
    expect(mapped.nomeRazaoSocialFornecedor).toBe("MARIA SILVA SANTOS");
    expect(mapped.ativo).toBe(false);
  });

  test("coerce de strings/numeros e booleans textuais", () => {
    const mapped = mapFornecedor({
      cnpj: 191,
      ativo: "true",
      habilitadoLicitar: "false",
      codigoCnae: "6201500",
      nomeRazaoSocialFornecedor: "  ACME  ",
      ufSigla: "mg",
    });

    expect(mapped.ativo).toBe(true);
    expect(mapped.habilitadoLicitar).toBe(false);
    expect(mapped.codigoCnae).toBe(6201500);
    expect(mapped.nomeRazaoSocialFornecedor).toBe("ACME");
    expect(mapped.ufSigla).toBe("MG");
    // cnpj com poucos digitos -> null
    expect(mapped.cnpj).toBeNull();
  });
});

describe("buildFtsQuery", () => {
  test("tokeniza e adiciona prefixo por token", () => {
    expect(buildFtsQuery("Construtora Sao")).toBe('"construtora"* "sao"*');
  });

  test("remove acentos e pontuacao", () => {
    expect(buildFtsQuery("S.A.")).toBe('"s"* "a"*');
  });

  test("retorna null quando nao sobra token", () => {
    expect(buildFtsQuery("   ")).toBeNull();
    expect(buildFtsQuery("...")).toBeNull();
  });
});

describe("store / schema + insert", () => {
  test("cria schema e insere registros contaveis", () => {
    const db = populatedDb();

    expect(totalFornecedores(db)).toBe(3);

    db.close();
  });
});

describe("buscarFornecedor (FTS por nome)", () => {
  let db: Database;

  beforeEach(() => {
    db = populatedDb();
  });

  test("encontra por prefixo de razao social", () => {
    const res = buscarFornecedor({ nome: "construtora" }, db);

    expect(Result.isOk(res)).toBe(true);
    const rows = Result.unwrap(res);

    expect(rows.length).toBe(1);
    expect(rows[0]!.nomeRazaoSocialFornecedor).toBe(
      "CONSTRUTORA SAO JOAO LTDA",
    );
    expect(rows[0]!.cnpj).toBe("00000000000191");
  });

  test("encontra PF por nome (CPF mascarado)", () => {
    const res = buscarFornecedor({ nome: "maria silva" }, db);
    const rows = Result.unwrap(res);

    expect(rows.length).toBe(1);
    expect(rows[0]!.cpf).toBe("***007562**");
    expect(rows[0]!.cnpj).toBeNull();
  });

  test("apenasAtivos filtra inativos", () => {
    const todos = Result.unwrap(buscarFornecedor({ nome: "silva" }, db));
    const ativos = Result.unwrap(
      buscarFornecedor({ nome: "silva", apenasAtivos: true }, db),
    );

    expect(todos.length).toBe(1);
    expect(ativos.length).toBe(0); // MARIA SILVA SANTOS esta inativa
  });

  test("termo sem token util retorna lista vazia", () => {
    const rows = Result.unwrap(buscarFornecedor({ nome: "   " }, db));

    expect(rows).toEqual([]);
  });
});

describe("fornecedorHabilitado (por CNPJ)", () => {
  let db: Database;

  beforeEach(() => {
    db = populatedDb();
  });

  test("ativo e habilitado", () => {
    const res = Result.unwrap(fornecedorHabilitado("00.000.000/0001-91", db));

    expect(res.encontrado).toBe(true);
    expect(res.ativo).toBe(true);
    expect(res.habilitadoLicitar).toBe(true);
    expect(res.fornecedor?.nomeRazaoSocialFornecedor).toBe(
      "CONSTRUTORA SAO JOAO LTDA",
    );
  });

  test("ativo mas nao habilitado", () => {
    const res = Result.unwrap(fornecedorHabilitado("11222333000181", db));

    expect(res.encontrado).toBe(true);
    expect(res.ativo).toBe(true);
    expect(res.habilitadoLicitar).toBe(false);
  });

  test("CNPJ inexistente => encontrado=false", () => {
    const res = Result.unwrap(fornecedorHabilitado("99999999999999", db));

    expect(res.encontrado).toBe(false);
    expect(res.fornecedor).toBeNull();
  });
});

describe("listarFornecedoresUfCnae (segmentacao)", () => {
  let db: Database;

  beforeEach(() => {
    db = populatedDb();
  });

  test("filtra por UF (case-insensitive na entrada)", () => {
    const rows = Result.unwrap(listarFornecedoresUfCnae({ uf: "sp" }, db));

    expect(rows.length).toBe(2);
    expect(rows.every((r) => r.ufSigla === "SP")).toBe(true);
  });

  test("filtra por CNAE", () => {
    const rows = Result.unwrap(listarFornecedoresUfCnae({ cnae: 6201500 }, db));

    expect(rows.length).toBe(1);
    expect(rows[0]!.nomeRazaoSocialFornecedor).toBe(
      "TECNOLOGIA E SOFTWARE BRASIL S.A.",
    );
  });

  test("filtra por municipio (LIKE)", () => {
    const rows = Result.unwrap(
      listarFornecedoresUfCnae({ municipio: "Campinas" }, db),
    );

    expect(rows.length).toBe(1);
    expect(rows[0]!.nomeMunicipio).toBe("Campinas");
  });

  test("combina UF + apenasAtivos", () => {
    const rows = Result.unwrap(
      listarFornecedoresUfCnae({ uf: "SP", apenasAtivos: true }, db),
    );

    // dois em SP, mas MARIA SILVA SANTOS esta inativa
    expect(rows.length).toBe(1);
    expect(rows[0]!.nomeRazaoSocialFornecedor).toBe(
      "CONSTRUTORA SAO JOAO LTDA",
    );
  });
});

describe("adapter", () => {
  test("expoe metadados corretos", async () => {
    const { sicafFornecedoresIndexAdapter } =
      await import("../src/modules/sicaf-fornecedores/indexer");

    expect(sicafFornecedoresIndexAdapter.key).toBe("sicaf-fornecedores");
    expect(sicafFornecedoresIndexAdapter.storage).toBe("sqlite");
    expect(sicafFornecedoresIndexAdapter.requiresHeavyDownload).toBe(false);
  });
});
