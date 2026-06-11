import { Database } from "bun:sqlite";
import { beforeAll, describe, expect, test } from "bun:test";
import {
  mapCatmatItem,
  mapCatserItem,
  toInt,
  toNumberOrNull,
  toStringOrNull,
  type RawCatmatItem,
  type RawCatserItem,
} from "../src/modules/catmat-catser/schema";
import {
  buildFtsQuery,
  buscarMaterial,
  buscarServico,
  normalizarItemEdital,
  resolverCatmatCatser,
  resolverMaterial,
  resolverServico,
} from "../src/modules/catmat-catser/service";
import {
  createSchema,
  insertCatmatItens,
  insertCatserItens,
  rebuildFts,
} from "../src/modules/catmat-catser/store";

// --- Fixtures inline (sem rede), com acentuacao real da API Compras.gov.br ---

const rawCatmat: RawCatmatItem[] = [
  {
    codigoItem: 206504,
    codigoGrupo: 71,
    nomeGrupo: "MOBILIÁRIOS",
    codigoClasse: 7110,
    nomeClasse: "MOBILIÁRIO PARA ESCRITÓRIO",
    codigoPdm: 313,
    nomePdm: "CADEIRA ESCRITÓRIO",
    descricaoItem:
      "CADEIRA ESCRITÓRIO, MATERIAL ESTRUTURA: TUBO AÇO, TIPO BASE: GIRATÓRIO, COR: AMARELA",
    statusItem: true,
    itemSustentavel: false,
    codigo_ncm: null,
    descricao_ncm: null,
    aplica_margem_preferencia: null,
    dataHoraAtualizacao: "2021-10-16T09:43:08.030221",
  },
  {
    codigoItem: 243756,
    codigoGrupo: 71,
    nomeGrupo: "MOBILIÁRIOS",
    codigoClasse: 7110,
    nomeClasse: "MOBILIÁRIO PARA ESCRITÓRIO",
    codigoPdm: 313,
    nomePdm: "CADEIRA ESCRITÓRIO",
    descricaoItem:
      "CADEIRA ESCRITÓRIO, MATERIAL REVESTIMENTO: TECIDO 100% LÃ, TIPO BASE: FIXO, COR: AZUL",
    statusItem: true,
    itemSustentavel: false,
    codigo_ncm: "9401",
    descricao_ncm: "ASSENTOS",
    aplica_margem_preferencia: true,
    dataHoraAtualizacao: "2021-10-16T09:43:08.030221",
  },
  {
    codigoItem: 399016,
    codigoGrupo: 68,
    nomeGrupo: "SUBSTÂNCIAS E PRODUTOS QUÍMICOS",
    codigoClasse: 6810,
    nomeClasse: "PRODUTOS QUÍMICOS",
    codigoPdm: 10081,
    nomePdm: "BETA-NICOTINAMIDA ADENINA DINUCLEOTÍDEO",
    descricaoItem:
      "BETA-NICOTINAMIDA ADENINA DINUCLEOTÍDEO, ASPECTO FÍSICO: PÓ BRANCO",
    statusItem: true,
    itemSustentavel: false,
    codigo_ncm: null,
    descricao_ncm: null,
    aplica_margem_preferencia: null,
    dataHoraAtualizacao: "2021-10-16T09:43:08.030221",
  },
];

const rawCatser: RawCatserItem[] = [
  {
    codigoServico: 7250,
    nomeServico:
      "ENDOSCOPIA DIGESTIVA CIRURGICA - DRENAGEM CAVITARIA POR LAPAROSCOPIA",
    codigoSecao: 9,
    nomeSecao: "SERVIÇOS DA COMUNIDADE, PESSOAIS E SOCIAIS E OUTROS SERVIÇOS",
    codigoDivisao: 93,
    nomeDivisao: "SERVIÇO SOCIAL E DE SAÚDE",
    codigoGrupo: 931,
    nomeGrupo: "SERVIÇOS DE SAÚDE HUMANA",
    codigoClasse: 9311,
    nomeClasse: "SERVIÇOS HOSPITALARES",
    codigoSubclasse: null,
    nomeSubclasse: null,
    codigoCpc: 9311,
    exclusivoCentralCompras: false,
    statusServico: true,
    dataHoraAtualizacao: "2021-10-16T09:09:59.689615",
  },
  {
    codigoServico: 7420,
    nomeServico: "MANUTENCAO DE COMPUTADOR E IMPRESSORA",
    codigoSecao: 8,
    nomeSecao: "SERVIÇOS PRESTADOS ÀS EMPRESAS",
    codigoDivisao: 87,
    nomeDivisao: "SERVIÇOS DE MANUTENÇÃO E REPARAÇÃO",
    codigoGrupo: 872,
    nomeGrupo: "SERVIÇOS DE REPARAÇÃO",
    codigoClasse: 8720,
    nomeClasse: "REPARACAO DE EQUIPAMENTOS",
    codigoSubclasse: null,
    nomeSubclasse: null,
    codigoCpc: 8720,
    exclusivoCentralCompras: false,
    statusServico: true,
    dataHoraAtualizacao: "2021-10-16T09:09:59.689615",
  },
];

function makeDb(): Database {
  const db = new Database(":memory:");

  createSchema(db);
  insertCatmatItens(db, rawCatmat.map(mapCatmatItem));
  insertCatserItens(db, rawCatser.map(mapCatserItem));
  rebuildFts(db);

  return db;
}

// --- Conversores puros ---

describe("conversores de schema", () => {
  test("toInt mapeia booleanos e nulos para 0/1", () => {
    expect(toInt(true)).toBe(1);
    expect(toInt(false)).toBe(0);
    expect(toInt(null)).toBe(0);
    expect(toInt(undefined)).toBe(0);
  });

  test("toNumberOrNull aceita numeros e descarta vazios", () => {
    expect(toNumberOrNull(71)).toBe(71);
    expect(toNumberOrNull("9311")).toBe(9311);
    expect(toNumberOrNull(null)).toBeNull();
    expect(toNumberOrNull("")).toBeNull();
    expect(toNumberOrNull("abc")).toBeNull();
  });

  test("toStringOrNull faz trim e devolve null para vazio", () => {
    expect(toStringOrNull("  oi  ")).toBe("oi");
    expect(toStringOrNull(null)).toBeNull();
    expect(toStringOrNull("   ")).toBeNull();
  });
});

// --- Mapeamento item bruto -> linha ---

describe("mapeamento de itens", () => {
  test("mapCatmatItem mapeia campos snake_case e booleanos", () => {
    const row = mapCatmatItem(rawCatmat[1]!);

    expect(row.codigoItem).toBe(243756);
    expect(row.codigoGrupo).toBe(71);
    expect(row.nomeGrupo).toBe("MOBILIÁRIOS");
    expect(row.codigoNcm).toBe("9401");
    expect(row.descricaoNcm).toBe("ASSENTOS");
    expect(row.statusItem).toBe(1);
    expect(row.itemSustentavel).toBe(0);
    expect(row.aplicaMargemPreferencia).toBe(1);
  });

  test("mapCatmatItem trata codigo_ncm null", () => {
    const row = mapCatmatItem(rawCatmat[0]!);

    expect(row.codigoNcm).toBeNull();
    expect(row.aplicaMargemPreferencia).toBe(0);
  });

  test("mapCatserItem preserva hierarquia secao>divisao>grupo>classe", () => {
    const row = mapCatserItem(rawCatser[0]!);

    expect(row.codigoServico).toBe(7250);
    expect(row.codigoSecao).toBe(9);
    expect(row.codigoDivisao).toBe(93);
    expect(row.codigoGrupo).toBe(931);
    expect(row.codigoClasse).toBe(9311);
    expect(row.codigoSubclasse).toBeNull();
    expect(row.codigoCpc).toBe(9311);
    expect(row.statusServico).toBe(1);
  });
});

// --- buildFtsQuery (sanitizacao) ---

describe("buildFtsQuery", () => {
  test("normaliza acentos, descarta tokens curtos e adiciona prefixo", () => {
    expect(buildFtsQuery("Cadeira Escritório")).toBe(
      '"cadeira"* "escritorio"*',
    );
  });

  test("descarta tokens com menos de 2 caracteres", () => {
    expect(buildFtsQuery("a notebook")).toBe('"notebook"*');
  });

  test("retorna string vazia quando nao ha token util", () => {
    expect(buildFtsQuery("   .  -  ")).toBe("");
    expect(buildFtsQuery("a")).toBe("");
  });

  test("escapa caracteres de sintaxe FTS (sem quebrar)", () => {
    // Aspas/dois-pontos viram separadores e os tokens sao citados.
    expect(buildFtsQuery('cadeira "OR" : nivel')).toBe(
      '"cadeira"* "or"* "nivel"*',
    );
  });
});

// --- Busca FTS sobre db :memory: ---

describe("busca de material (FTS)", () => {
  let db: Database;

  beforeAll(() => {
    db = makeDb();
  });

  test("encontra por nome ignorando acentos", () => {
    const r = buscarMaterial(db, "cadeira escritorio");

    expect(r.length).toBe(2);
    expect(r.map((m) => m.codigoItem).sort()).toEqual([206504, 243756]);
    expect(r[0]!.tipo).toBe("material");
  });

  test("casa por prefixo (cade -> cadeira)", () => {
    const r = buscarMaterial(db, "cade");

    expect(r.length).toBe(2);
  });

  test("retorna vazio para termo inexistente", () => {
    expect(buscarMaterial(db, "helicoptero")).toEqual([]);
  });

  test("respeita o limite", () => {
    const r = buscarMaterial(db, "cadeira", 1);

    expect(r.length).toBe(1);
  });
});

describe("busca de servico (FTS)", () => {
  let db: Database;

  beforeAll(() => {
    db = makeDb();
  });

  test("encontra servico por nome", () => {
    const r = buscarServico(db, "manutencao computador");

    expect(r.length).toBe(1);
    expect(r[0]!.codigoServico).toBe(7420);
    expect(r[0]!.tipo).toBe("servico");
  });

  test("encontra por termo acentuado (endoscopia)", () => {
    const r = buscarServico(db, "endoscopia");

    expect(r.length).toBe(1);
    expect(r[0]!.codigoServico).toBe(7250);
  });
});

// --- Lookup por codigo + hierarquia ---

describe("resolver por codigo", () => {
  let db: Database;

  beforeAll(() => {
    db = makeDb();
  });

  test("resolverMaterial devolve hierarquia Grupo>Classe>PDM>Item", () => {
    const m = resolverMaterial(db, 206504);

    expect(m).not.toBeNull();
    expect(m!.nomeGrupo).toBe("MOBILIÁRIOS");
    expect(m!.nomeClasse).toBe("MOBILIÁRIO PARA ESCRITÓRIO");
    expect(m!.nomePdm).toBe("CADEIRA ESCRITÓRIO");
    expect(m!.statusItem).toBe(true);
  });

  test("resolverMaterial devolve null para codigo inexistente", () => {
    expect(resolverMaterial(db, 999999)).toBeNull();
  });

  test("resolverServico devolve hierarquia de servico", () => {
    const s = resolverServico(db, 7250);

    expect(s).not.toBeNull();
    expect(s!.nomeSecao).toContain("SERVIÇOS");
    expect(s!.codigoCpc).toBe(9311);
  });

  test("resolverCatmatCatser tenta os dois lados", () => {
    const r = resolverCatmatCatser(db, 206504);

    expect(r.material).not.toBeNull();
    expect(r.servico).toBeNull();
  });

  test("resolverCatmatCatser respeita tipo explicito", () => {
    const r = resolverCatmatCatser(db, 7250, "servico");

    expect(r.material).toBeNull();
    expect(r.servico).not.toBeNull();
  });
});

// --- Normalizacao de descricao livre de edital ---

describe("normalizarItemEdital", () => {
  test("recupera candidatos de material por descricao livre (OR + bm25)", () => {
    const db = makeDb();
    const r = normalizarItemEdital(db, "cadeira giratoria escritorio");

    expect(r.termo).toBe("cadeira giratoria escritorio");
    // Modo OR: qualquer token casa; o item de mobiliario lidera por relevancia.
    expect(r.materiais.length).toBeGreaterThan(0);
    expect(r.materiais[0]!.codigoItem).toBe(206504);
    // Nenhum servico compartilha tokens com a descricao -> nao retorna servico.
    expect(r.servicos).toEqual([]);
  });

  test("recupera candidatos de servico por descricao livre", () => {
    const db = makeDb();
    const r = normalizarItemEdital(db, "manutencao de impressora");

    expect(r.servicos.length).toBeGreaterThan(0);
    expect(r.servicos[0]!.codigoServico).toBe(7420);
  });
});
